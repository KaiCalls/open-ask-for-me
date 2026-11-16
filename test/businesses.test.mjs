import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseBusinessFlag, loadBusinessFile, parseCsv } from '../lib/businesses.mjs';
import { parseArgs } from '../lib/args.mjs';

test('parses --business values', () => {
  assert.deepEqual(parseBusinessFlag('Joe Tire|+19085550101|NJ'), { name: 'Joe Tire', phone: '+19085550101', state: 'NJ' });
  assert.deepEqual(parseBusinessFlag('Joe Tire|+19085550101'), { name: 'Joe Tire', phone: '+19085550101', state: null });
  assert.throws(() => parseBusinessFlag('no phone'));
});

test('parses CSV with quoted commas', () => {
  const rows = parseCsv('name,phone,state\n"Smith, Sons Auto",908-555-0101,NJ\n');
  assert.deepEqual(rows, [{ name: 'Smith, Sons Auto', phone: '908-555-0101', state: 'NJ' }]);
});

test('loads JSON files in either shape', () => {
  const dir = mkdtempSync(join(tmpdir(), 'oafm-'));
  const p1 = join(dir, 'a.json');
  writeFileSync(p1, JSON.stringify([{ name: 'A', phone: '+19085550101', state: 'NJ' }]));
  const p2 = join(dir, 'b.json');
  writeFileSync(p2, JSON.stringify({ businesses: [{ name: 'B', phone: '+19085550102' }] }));
  assert.equal(loadBusinessFile(p1)[0].name, 'A');
  assert.equal(loadBusinessFile(p2)[0].state, null);
});

test('dry run is the default and --max-calls defaults to 3', () => {
  const o = parseArgs(['price for a tire change?', '--business', 'A|+19085550101']);
  assert.equal(o.live, false);
  assert.equal(o.maxCalls, 3);
  assert.equal(o.question, 'price for a tire change?');
});

test('rejects bad flags', () => {
  assert.throws(() => parseArgs(['q', '--live', '--dry-run']));
  assert.throws(() => parseArgs(['q', '--max-calls', '0']));
  assert.throws(() => parseArgs(['q', '--nope']));
});
