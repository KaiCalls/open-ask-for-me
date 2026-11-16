// Load the list of businesses to call from a CSV/JSON file or --business flags.
import { readFileSync } from 'node:fs';

// --business "Name|+19085550101" or "Name|+19085550101|NJ"
export function parseBusinessFlag(value) {
  const [name, phone, state] = String(value).split('|').map((s) => s && s.trim());
  if (!name || !phone) {
    throw new Error(`--business needs "Name|+1XXXXXXXXXX[|STATE]", got: ${value}`);
  }
  return { name, phone, state: state || null };
}

// Minimal CSV parser: header row, comma separated, double quotes for fields with commas.
export function parseCsv(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { cells.push(cur); cur = ''; }
      else cur += ch;
    }
    cells.push(cur);
    rows.push(cells.map((c) => c.trim()));
  }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.toLowerCase());
  return rows.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function normalizeRecord(r) {
  const name = r.name || r.business || r.business_name;
  const phone = r.phone || r.phone_number || r.number;
  if (!name || !phone) throw new Error(`each business needs a name and phone: ${JSON.stringify(r)}`);
  return { name: String(name), phone: String(phone), state: r.state ? String(r.state) : null };
}

export function loadBusinessFile(path) {
  const text = readFileSync(path, 'utf8');
  let records;
  if (path.toLowerCase().endsWith('.json')) {
    const data = JSON.parse(text);
    records = Array.isArray(data) ? data : data.businesses;
    if (!Array.isArray(records)) throw new Error(`${path}: expected an array or { "businesses": [...] }`);
  } else {
    records = parseCsv(text);
  }
  return records.map(normalizeRecord);
}
