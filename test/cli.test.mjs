import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startFakeMcp } from './fake-mcp-server.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'ask.mjs');

function runCli(args, { env = {}, input = '' } = {}) {
  return new Promise((resolve) => {
    const home = mkdtempSync(join(tmpdir(), 'oafm-home-'));
    const child = spawn(process.execPath, [BIN, ...args], {
      cwd: home,
      env: { PATH: process.env.PATH, OPEN_ASK_FOR_ME_HOME: home, ...env },
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    child.stdin.end(input);
    child.on('close', (code) => resolve({ code, stdout, stderr, home }));
  });
}

const BIZ = ['--business', 'Bernardsville Tire|+19085550101|NJ', '--business', 'Seattle Tire|+12065550100|WA'];

test('CLI dry run prints a table, writes results, and keeps the ledger empty', async () => {
  const r = await runCli(['tire change price?', ...BIZ, '--out', 'out.json']);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stderr, /Dry run/);
  assert.match(r.stdout, /\| Bernardsville Tire \| \+19085550101 \| not called \(dry run\) \|  \| dry-run \|/);
  assert.match(r.stdout, /Seattle Tire.*skipped/);
  assert.equal(existsSync(join(r.home, 'called.json')), false);
  const out = JSON.parse(readFileSync(join(r.home, 'out.json'), 'utf8'));
  assert.equal(out.live, false);
});

test('CLI --live without a key stops with the signup link', async () => {
  const r = await runCli(['q', ...BIZ, '--live']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /CALLMCP_API_KEY/);
  assert.match(r.stderr, /utm_content=open-ask-for-me/);
});

test('CLI --live does not dial unless the user types CALL', async () => {
  const fake = await startFakeMcp();
  try {
    const r = await runCli(['q', ...BIZ, '--live', '--endpoint', fake.url], { env: { CALLMCP_API_KEY: 'kc_live_test' }, input: 'yes\n' });
    assert.equal(r.code, 1);
    assert.equal(fake.state.makeCalls.length, 0);
    assert.match(r.stdout, /not confirmed/);
  } finally { await fake.close(); }
});

test('CLI --live dials after CALL and prints answers', async () => {
  const fake = await startFakeMcp({ answers: { '+19085550101': 'Mount and balance is $25 per tire.' } });
  try {
    const r = await runCli(['q', ...BIZ, '--live', '--endpoint', fake.url, '--poll-interval', '0.01'], { env: { CALLMCP_API_KEY: 'kc_live_test' }, input: 'CALL\n' });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(fake.state.makeCalls.map((a) => a.to), ['+19085550101']);
    assert.match(r.stdout, /\| Bernardsville Tire \| \+19085550101 \| Mount and balance is \$25 per tire\. \| \$25 \| completed \|/);
    assert.match(r.stdout, /Per-call summaries/);
    const ledger = JSON.parse(readFileSync(join(r.home, 'called.json'), 'utf8'));
    assert.deepEqual(Object.keys(ledger), ['+19085550101']);
  } finally { await fake.close(); }
});
