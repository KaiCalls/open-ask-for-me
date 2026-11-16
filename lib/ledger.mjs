// Local ledger of every number this tool has dialed, keyed by E.164.
// A number in the ledger is never called again. Delete an entry by hand only if you mean it.
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';

export function defaultLedgerPath() {
  const base = process.env.OPEN_ASK_FOR_ME_HOME || join(homedir(), '.open-ask-for-me');
  return join(base, 'called.json');
}

export class Ledger {
  constructor(path = defaultLedgerPath()) {
    this.path = path;
    this.entries = {};
    if (existsSync(path)) {
      const text = readFileSync(path, 'utf8').trim();
      // A corrupt ledger must stop the run, not silently reset to empty.
      this.entries = text ? JSON.parse(text) : {};
    }
  }

  has(e164) {
    return Object.prototype.hasOwnProperty.call(this.entries, e164);
  }

  get(e164) {
    return this.entries[e164];
  }

  // Record the number before dialing, so a crash mid-call still blocks a redial.
  record(e164, info) {
    this.entries[e164] = { at: new Date().toISOString(), ...info };
    this.save();
  }

  update(e164, info) {
    if (!this.has(e164)) return;
    this.entries[e164] = { ...this.entries[e164], ...info };
    this.save();
  }

  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.entries, null, 2) + '\n');
    renameSync(tmp, this.path);
  }
}
