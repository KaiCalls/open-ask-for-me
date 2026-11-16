// Guardrails that run before any call is placed.
// Every rule here is enforced in code. A business that fails a rule is skipped, never dialed.

// Washington area codes (NANPA).
export const WA_AREA_CODES = new Set(['206', '253', '360', '425', '509', '564']);

// California area codes, including overlays (NANPA). Review this list when new overlays open.
export const CA_AREA_CODES = new Set([
  '209', '213', '279', '310', '323', '341', '350', '369', '408', '415', '424', '442',
  '510', '530', '559', '562', '619', '626', '628', '650', '657', '661', '669', '707',
  '714', '738', '747', '760', '805', '818', '820', '831', '840', '858', '909', '916',
  '925', '949', '951',
]);

// +1 area codes that belong to other NANP countries and territories outside the US and Canada.
// US territories (Puerto Rico, USVI, Guam, CNMI, American Samoa) are also excluded to keep scope simple.
export const NON_US_CA_NANP = new Set([
  '242', '246', '264', '268', '284', '340', '345', '441', '473', '649', '658', '664',
  '670', '671', '684', '721', '758', '767', '784', '787', '809', '829', '849', '868',
  '869', '876', '939',
]);

// Premium-rate and service codes that are never a local business line.
const BLOCKED_AREA_CODES = new Set(['900', '976']);

const BLOCKED_STATES = new Map([
  ['WA', 'WA'], ['WASHINGTON', 'WA'],
  ['CA', 'CA'], ['CALIFORNIA', 'CA'],
]);

// Normalize a phone number to E.164. Returns null when it is not a valid
// North American (+1) number.
export function toE164(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s.startsWith('+') && !s.startsWith('+1')) return null; // another country code
  let digits = s.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  // NANP: area code and exchange both start with 2-9.
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

export function areaCodeOf(e164) {
  return e164 ? e164.slice(2, 5) : null;
}

export function normalizeState(state) {
  if (!state) return null;
  const key = String(state).trim().toUpperCase().replace(/\./g, '');
  return BLOCKED_STATES.get(key) || key;
}

// Returns { ok: true, to } or { ok: false, reason }.
export function checkBusiness(business, { ledger } = {}) {
  const to = toE164(business.phone);
  if (!to) {
    return { ok: false, reason: 'not a valid US or Canada phone number' };
  }
  const ac = areaCodeOf(to);
  if (NON_US_CA_NANP.has(ac)) {
    return { ok: false, reason: `area code ${ac} is outside the US and Canada` };
  }
  if (BLOCKED_AREA_CODES.has(ac)) {
    return { ok: false, reason: `area code ${ac} is a premium-rate code` };
  }
  const state = normalizeState(business.state);
  if (state === 'WA' || state === 'CA') {
    return { ok: false, reason: `state ${state} is excluded (no calls to WA or CA businesses)` };
  }
  if (WA_AREA_CODES.has(ac)) {
    return { ok: false, reason: `area code ${ac} is a Washington area code (excluded)` };
  }
  if (CA_AREA_CODES.has(ac)) {
    return { ok: false, reason: `area code ${ac} is a California area code (excluded)` };
  }
  if (ledger && ledger.has(to)) {
    return { ok: false, reason: `already called ${to} on ${ledger.get(to).at} (never call a number twice)` };
  }
  return { ok: true, to };
}
