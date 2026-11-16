#!/usr/bin/env node
// open-ask-for-me: your agent calls local businesses and brings back the answers.
// Zero dependencies. Node 18+.
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { loadBusinessFile } from '../lib/businesses.mjs';
import { Ledger, defaultLedgerPath } from '../lib/ledger.mjs';
import { CallMcpClient, DEFAULT_ENDPOINT } from '../lib/callmcp.mjs';
import { run } from '../lib/run.mjs';
import { parseArgs } from '../lib/args.mjs';
import { renderTable, renderTranscriptSummaries } from '../lib/report.mjs';

const HELP = `Usage:
  ask "<question>" --businesses <file.csv|file.json> [options]
  ask "<question>" --business "Name|+19085550101|NJ" [--business ...] [options]

Options:
  --live                 Place real calls. Without it, nothing is dialed (dry run).
  --max-calls <n>        Most calls to place in one run (default 3).
  --out <file>           Where to write results JSON (default ./ask-results-<time>.json).
  --agent-id <id>        CallMCP agent to use (optional; default is the account's one agent).
  --facts "<text>"       Details Kai may share if the shop asks (e.g. "tires are new, 215/55R16").
  --poll-interval <sec>  Seconds between status checks (default 10).
  --timeout <sec>        Stop waiting after this many seconds (default 600).
  --endpoint <url>       MCP endpoint (default ${DEFAULT_ENDPOINT}).
  -h, --help             Show this help.

Environment:
  CALLMCP_API_KEY        Your CallMCP key (kc_live_...). Needed only with --live.

Guardrails: no WA or CA businesses, US/Canada numbers only, a number is never called twice
(ledger: ${defaultLedgerPath()}), and --live asks you to type CALL before dialing.`;

function askLine(prompt) {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    let answered = false;
    rl.question(prompt, (line) => { answered = true; rl.close(); resolve(line); });
    rl.on('close', () => { if (!answered) resolve(''); });
  });
}

async function confirmOnTerminal(planned, question) {
  const err = process.stderr;
  err.write(`\nAbout to place ${planned.length} real phone call(s). Each one rings a real business.\n`);
  err.write(`Question: ${question}\n`);
  for (const p of planned) err.write(`  - ${p.name} ${p.to}${p.state ? ` (${p.state})` : ''}\n`);
  const line = await askLine('Type CALL to dial, anything else to stop: ');
  return line.trim() === 'CALL';
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`ask: ${err.message}\n\n${HELP}\n`);
    process.exit(2);
  }
  if (opts.help) { process.stdout.write(HELP + '\n'); return; }
  if (!opts.question) { process.stderr.write(`ask: a question is required\n\n${HELP}\n`); process.exit(2); }

  const businesses = [...(opts.file ? loadBusinessFile(opts.file) : []), ...opts.businesses];
  if (businesses.length === 0) { process.stderr.write('ask: give --businesses <file> or at least one --business\n'); process.exit(2); }

  const ledger = new Ledger();
  let client;
  if (opts.live) {
    const apiKey = process.env.CALLMCP_API_KEY;
    if (!apiKey) {
      process.stderr.write('ask: --live needs CALLMCP_API_KEY. Get a key at https://callmcp.ai/?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me\n');
      process.exit(2);
    }
    client = new CallMcpClient({ apiKey, endpoint: opts.endpoint || process.env.CALLMCP_ENDPOINT || DEFAULT_ENDPOINT });
  } else {
    process.stderr.write('Dry run: nothing will be dialed. Add --live to place real calls.\n');
  }

  const out = await run({
    question: opts.question,
    businesses,
    live: opts.live,
    maxCalls: opts.maxCalls,
    ledger,
    client,
    confirm: confirmOnTerminal,
    log: (m) => process.stderr.write(m + '\n'),
    pollIntervalMs: opts.pollInterval * 1000,
    timeoutMs: opts.timeout * 1000,
    agentId: opts.agentId,
    facts: opts.facts,
  });

  const outPath = opts.out || `ask-results-${out.runId}.json`;
  writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');

  process.stdout.write(`\n**${opts.question}**\n\n${renderTable(out.results)}\n`);
  const summaries = renderTranscriptSummaries(out.results);
  if (summaries) process.stdout.write(summaries + '\n');
  process.stdout.write(`\nResults written to ${outPath}\n`);
  if (out.aborted) process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`ask: ${err.message}\n`);
  process.exit(1);
});
