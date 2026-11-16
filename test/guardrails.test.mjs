import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toE164, checkBusiness, WA_AREA_CODES, CA_AREA_CODES } from '../lib/guardrails.mjs';

test('toE164 normalizes US and Canada numbers', () => {
  assert.equal(toE164('(908) 555-0101'), '+19085550101');
  assert.equal(toE164('1-908-555-0101'), '+19085550101');
  assert.equal(toE164('+1 416 555 0199'), '+14165550199');
});

test('toE164 rejects other countries and malformed numbers', () => {
  assert.equal(toE164('+44 20 7946 0958'), null);
  assert.equal(toE164('555-0101'), null);
  assert.equal(toE164('+1 108 555 0101'), null); // area code cannot start with 1
  assert.equal(toE164(''), null);
});

test('allows a New Jersey business', () => {
  const r = checkBusiness({ name: 'Shop', phone: '+19085550101', state: 'NJ' });
  assert.deepEqual(r, { ok: true, to: '+19085550101' });
});

test('allows a Canadian business', () => {
  assert.equal(checkBusiness({ name: 'Toronto Tire', phone: '+14165550199', state: 'ON' }).ok, true);
});

test('refuses WA and CA by state, in any spelling', () => {
  for (const state of ['WA', 'wa', 'Washington', 'CA', 'California', 'ca']) {
    const r = checkBusiness({ name: 'X', phone: '+19085550101', state });
    assert.equal(r.ok, false, state);
    assert.match(r.reason, /excluded/);
  }
});

test('refuses WA and CA by area code even when the state says otherwise', () => {
  const wa = checkBusiness({ name: 'Seattle Shop', phone: '+12065550100', state: 'NJ' });
  assert.equal(wa.ok, false);
  assert.match(wa.reason, /Washington/);
  const ca = checkBusiness({ name: 'SF Shop', phone: '(415) 555-0100' });
  assert.equal(ca.ok, false);
  assert.match(ca.reason, /California/);
});

test('every WA and CA area code is blocked', () => {
  for (const ac of [...WA_AREA_CODES, ...CA_AREA_CODES]) {
    assert.equal(checkBusiness({ name: 'X', phone: `+1${ac}5550100` }).ok, false, ac);
  }
});

test('refuses +1 numbers outside the US and Canada', () => {
  const r = checkBusiness({ name: 'Kingston', phone: '+18765550100' });
  assert.equal(r.ok, false);
  assert.match(r.reason, /outside the US and Canada/);
});

test('refuses premium-rate 900 numbers', () => {
  assert.equal(checkBusiness({ name: 'X', phone: '+19005550100' }).ok, false);
});

test('refuses a number already in the ledger', () => {
  const ledger = new Map([['+19085550101', { at: '2026-11-01T00:00:00Z' }]]);
  const r = checkBusiness({ name: 'Shop', phone: '908-555-0101' }, { ledger });
  assert.equal(r.ok, false);
  assert.match(r.reason, /never call a number twice/);
});

import { buildContext } from '../lib/callmcp.mjs';
test('facts are passed into the call context and hold is discouraged', () => {
  const c = buildContext('price?', 'Shop', 'tires are new');
  assert.match(c, /tires are new/);
  assert.match(c, /do not put them on hold/);
  assert.doesNotMatch(buildContext('price?', 'Shop'), /Facts you can share/);
});
