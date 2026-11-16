import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startFakeMcp } from './fake-mcp-server.mjs';
import { run, planCalls } from '../lib/run.mjs';
import { Ledger } from '../lib/ledger.mjs';
import { KaiCallsClient, makeCallArgs } from '../lib/kaicalls.mjs';
import { renderTable, extractPrice } from '../lib/report.mjs';

const Q = 'How much is a tire change for a 2019 Honda Civic, and can you do it this week?';
const SHOPS = [
  { name: 'Bernardsville Tire', phone: '+19085550101', state: 'NJ' },
  { name: 'Basking Ridge Auto', phone: '(908) 555-0102', state: 'NJ' },
  { name: 'Morristown Service', phone: '973-555-0103', state: 'NJ' },
];
const ANSWERS = {
  '+19085550101': 'They charge $25 per tire to mount and balance. Open slots Thursday.',
  '+19085550102': 'Tire change is $89.99 for all four. Walk-ins Saturday.',
  '+19735550103': 'They do not give prices over the phone.',
};

const freshLedger = () => new Ledger(join(mkdtempSync(join(tmpdir(), 'oafm-')), 'called.json'));
const yes = async () => true;
const fast = { pollIntervalMs: 5, timeoutMs: 2000 };

test('dry run never contacts the server and writes nothing to the ledger', async () => {
  const fake = await startFakeMcp();
  const ledger = freshLedger();
  try {
    const out = await run({ question: Q, businesses: SHOPS, ledger, live: false });
    assert.equal(fake.state.requests.length, 0);
    assert.deepEqual(ledger.entries, {});
    assert.equal(out.results.filter((r) => r.status === 'dry-run').length, 3);
    assert.equal(out.results[0].makeCallArgs.to, '+19085550101');
  } finally { await fake.close(); }
});

test('make_call arguments carry the question as a customer request', () => {
  const a = makeCallArgs({ to: '+19085550101', businessName: 'Bernardsville Tire', question: Q, runId: 'r1' });
  assert.deepEqual(Object.keys(a).sort(), ['context', 'external_ref', 'idempotency_key', 'to']);
  assert.match(a.context, /assistant calling Bernardsville Tire on behalf of a customer/);
  assert.ok(a.context.includes(Q));
  assert.match(a.context, /Do not book, buy, or agree to anything/);
  assert.equal(a.idempotency_key, makeCallArgs({ to: '+19085550101', businessName: 'x', question: Q, runId: 'r2' }).idempotency_key);
});

test('--max-calls caps the plan and duplicates in the list are dropped', () => {
  const list = [...SHOPS, { name: 'Dup', phone: '908.555.0101' }, { name: 'Fourth', phone: '+19735550104' }];
  const { planned, skipped } = planCalls({ businesses: list, ledger: freshLedger(), maxCalls: 3 });
  assert.equal(planned.length, 3);
  assert.ok(skipped.find((s) => s.name === 'Dup' && /duplicate/.test(s.reason)));
  assert.ok(skipped.find((s) => s.name === 'Fourth' && /max-calls/.test(s.reason)));
});

test('live run without confirmation places no calls', async () => {
  const fake = await startFakeMcp();
  try {
    const client = new KaiCallsClient({ apiKey: 'kc_live_test', endpoint: fake.url });
    const ledger = freshLedger();
    const out = await run({ question: Q, businesses: SHOPS, ledger, live: true, client, confirm: async () => false, ...fast });
    assert.equal(out.aborted, true);
    assert.equal(fake.state.makeCalls.length, 0);
    assert.deepEqual(ledger.entries, {});
  } finally { await fake.close(); }
});

test('live run calls, polls, and returns answers with prices', async () => {
  const fake = await startFakeMcp({ answers: ANSWERS, pollsUntilDone: 2 });
  try {
    const client = new KaiCallsClient({ apiKey: 'kc_live_test', endpoint: fake.url });
    const ledger = freshLedger();
    const out = await run({ question: Q, businesses: SHOPS, ledger, live: true, client, confirm: yes, ...fast });
    assert.equal(fake.state.makeCalls.length, 3);
    assert.deepEqual(fake.state.makeCalls.map((a) => a.to), ['+19085550101', '+19085550102', '+19735550103']);
    const byName = Object.fromEntries(out.results.map((r) => [r.name, r]));
    assert.equal(byName['Bernardsville Tire'].status, 'completed');
    assert.equal(byName['Bernardsville Tire'].price, '$25');
    assert.equal(byName['Basking Ridge Auto'].price, '$89.99');
    assert.equal(byName['Morristown Service'].price, '');
    assert.match(byName['Basking Ridge Auto'].transcript, /on behalf of a customer/);
    assert.equal(Object.keys(ledger.entries).length, 3);
    assert.equal(ledger.get('+19085550102').status, 'completed');
    // MCP session handshake happened and the session id was reused
    const init = fake.state.requests.find((r) => r.msg.method === 'initialize');
    assert.ok(init);
    const call = fake.state.requests.find((r) => r.msg.method === 'tools/call');
    assert.equal(call.headers['mcp-session-id'], 'fake-session-1');
    assert.equal(call.headers.authorization, 'Bearer kc_live_test');
  } finally { await fake.close(); }
});

test('a second run never calls the same numbers again', async () => {
  const fake = await startFakeMcp({ answers: ANSWERS });
  try {
    const client = new KaiCallsClient({ apiKey: 'kc_live_test', endpoint: fake.url });
    const ledger = freshLedger();
    await run({ question: Q, businesses: SHOPS, ledger, live: true, client, confirm: yes, ...fast });
    assert.equal(fake.state.makeCalls.length, 3);
    const again = await run({ question: 'different question', businesses: SHOPS, ledger, live: true, client, confirm: yes, ...fast });
    assert.equal(fake.state.makeCalls.length, 3);
    assert.ok(again.results.every((r) => r.status === 'skipped' && /never call a number twice/.test(r.reason)));
  } finally { await fake.close(); }
});

test('WA and CA businesses are skipped in a live run and never reach the server', async () => {
  const fake = await startFakeMcp({ answers: ANSWERS });
  try {
    const client = new KaiCallsClient({ apiKey: 'kc_live_test', endpoint: fake.url });
    const list = [
      { name: 'Seattle Tire', phone: '+12065550100', state: 'WA' },
      { name: 'LA Tire', phone: '+13105550100', state: 'NJ' },
      SHOPS[0],
    ];
    const out = await run({ question: Q, businesses: list, ledger: freshLedger(), live: true, client, confirm: yes, ...fast });
    assert.deepEqual(fake.state.makeCalls.map((a) => a.to), ['+19085550101']);
    assert.equal(out.results.filter((r) => r.status === 'skipped').length, 2);
  } finally { await fake.close(); }
});

test('a tool error is reported and the number still counts as called', async () => {
  const fake = await startFakeMcp({ failNumbers: ['+19085550101'] });
  try {
    const client = new KaiCallsClient({ apiKey: 'kc_live_test', endpoint: fake.url });
    const ledger = freshLedger();
    const out = await run({ question: Q, businesses: [SHOPS[0]], ledger, live: true, client, confirm: yes, ...fast });
    assert.equal(out.results[0].status, 'error');
    assert.match(out.results[0].reason, /Call blocked/);
    assert.equal(ledger.get('+19085550101').status, 'error');
  } finally { await fake.close(); }
});

test('works when the server answers with text/event-stream', async () => {
  const fake = await startFakeMcp({ answers: ANSWERS, sse: true });
  try {
    const client = new KaiCallsClient({ apiKey: 'kc_live_test', endpoint: fake.url });
    const out = await run({ question: Q, businesses: [SHOPS[1]], ledger: freshLedger(), live: true, client, confirm: yes, ...fast });
    assert.equal(out.results[0].price, '$89.99');
  } finally { await fake.close(); }
});

test('a wrong API key fails before any call is placed', async () => {
  const fake = await startFakeMcp();
  try {
    const client = new KaiCallsClient({ apiKey: 'kc_live_wrong', endpoint: fake.url });
    const ledger = freshLedger();
    const out = await run({ question: Q, businesses: [SHOPS[0]], ledger, live: true, client, confirm: yes, ...fast });
    assert.equal(out.results[0].status, 'error');
    assert.match(out.results[0].reason, /rejected the API key/);
    assert.equal(fake.state.makeCalls.length, 0);
    assert.deepEqual(ledger.entries, {});
  } finally { await fake.close(); }
});

test('table output has one row per business', () => {
  const md = renderTable([
    { name: 'A | B Tire', to: '+19085550101', answer: '$25 per tire', price: '$25', status: 'completed' },
    { name: 'Seattle', phone: '+12065550100', reason: 'area code 206 is a Washington area code (excluded)', status: 'skipped' },
  ]);
  const lines = md.split('\n');
  assert.equal(lines[0], '| Business | Phone | Answer | Price | Status |');
  assert.equal(lines.length, 4);
  assert.match(lines[2], /A \\\| B Tire/);
  assert.match(lines[3], /Washington/);
  assert.equal(extractPrice('between $80 and $120.50 total'), '$80 - $120.50');
});
