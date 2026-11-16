import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Ledger } from '../lib/ledger.mjs';

test('ledger persists across instances, keyed by E.164', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'oafm-')), 'sub', 'called.json');
  const a = new Ledger(path);
  assert.equal(a.has('+19085550101'), false);
  a.record('+19085550101', { name: 'Shop' });
  a.update('+19085550101', { status: 'completed' });
  const b = new Ledger(path);
  assert.equal(b.has('+19085550101'), true);
  assert.equal(b.get('+19085550101').status, 'completed');
  assert.ok(JSON.parse(readFileSync(path, 'utf8'))['+19085550101'].at);
});

test('a corrupt ledger stops the run instead of resetting', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'oafm-')), 'called.json');
  writeFileSync(path, '{not json');
  assert.throws(() => new Ledger(path));
});
