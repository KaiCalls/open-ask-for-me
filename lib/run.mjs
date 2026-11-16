// The run: check guardrails, plan, confirm, dial, poll, collect answers.
import { checkBusiness, toE164 } from './guardrails.mjs';
import { makeCallArgs, readMakeCall, readStatus, TERMINAL_STATUSES } from './kaicalls.mjs';
import { extractPrice } from './report.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Decide who gets called. Pure: no network, no ledger writes.
export function planCalls({ businesses, ledger, maxCalls }) {
  const planned = [];
  const skipped = [];
  const seen = new Set();
  for (const b of businesses) {
    const e164 = toE164(b.phone);
    if (e164 && seen.has(e164)) {
      skipped.push({ ...b, to: e164, status: 'skipped', reason: 'duplicate number in this list' });
      continue;
    }
    const check = checkBusiness(b, { ledger });
    if (!check.ok) {
      skipped.push({ ...b, to: e164, status: 'skipped', reason: check.reason });
      continue;
    }
    seen.add(check.to);
    if (planned.length >= maxCalls) {
      skipped.push({ ...b, to: check.to, status: 'skipped', reason: `over --max-calls ${maxCalls}` });
      continue;
    }
    planned.push({ ...b, to: check.to });
  }
  return { planned, skipped };
}

export async function run({
  question,
  businesses,
  live = false,
  maxCalls = 3,
  ledger,
  client,
  confirm,
  log = () => {},
  pollIntervalMs = 10_000,
  timeoutMs = 10 * 60_000,
  runId = new Date().toISOString().replace(/[:.]/g, '-'),
  agentId,
  facts,
}) {
  if (!question || !question.trim()) throw new Error('a question is required');
  const { planned, skipped } = planCalls({ businesses, ledger, maxCalls });

  for (const s of skipped) log(`skip  ${s.name} (${s.to || s.phone}): ${s.reason}`);

  if (!live) {
    const results = planned.map((p) => ({
      ...p,
      status: 'dry-run',
      answer: 'not called (dry run)',
      makeCallArgs: makeCallArgs({ to: p.to, businessName: p.name, question, runId, agentId, facts }),
    }));
    return { runId, question, live, results: [...results, ...skipped] };
  }

  if (planned.length === 0) return { runId, question, live, results: skipped };

  if (!client) throw new Error('live mode needs a KaiCalls client');
  if (typeof confirm !== 'function') throw new Error('live mode needs a confirmation step');
  const confirmed = await confirm(planned, question);
  if (!confirmed) {
    const results = planned.map((p) => ({ ...p, status: 'not confirmed', answer: 'not called' }));
    return { runId, question, live, aborted: true, results: [...results, ...skipped] };
  }

  // Connect and authenticate before touching the ledger, so a bad key burns no numbers.
  if (typeof client.init === 'function') {
    try {
      await client.init();
    } catch (err) {
      log(`error ${err.message}`);
      const results = planned.map((p) => ({ ...p, status: 'error', reason: err.message, answer: err.message }));
      return { runId, question, live, results: [...results, ...skipped] };
    }
  }

  const active = [];
  for (const p of planned) {
    const args = makeCallArgs({ to: p.to, businessName: p.name, question, runId, agentId, facts });
    // Write the ledger first. If anything fails after this point, the number still counts as called.
    ledger.record(p.to, { name: p.name, question, runId, status: 'dialing' });
    const r = { ...p, status: 'dialing' };
    try {
      const sc = await client.makeCall(args);
      const { callId, status } = readMakeCall(sc);
      r.callId = callId;
      r.status = status || 'queued';
      ledger.update(p.to, { callId, status: r.status });
      log(`call  ${p.name} (${p.to}): ${r.status}${callId ? ` [${callId}]` : ''}`);
    } catch (err) {
      r.status = 'error';
      r.reason = err.message;
      ledger.update(p.to, { status: 'error', error: err.message });
      log(`error ${p.name} (${p.to}): ${err.message}`);
    }
    active.push(r);
  }

  const deadline = Date.now() + timeoutMs;
  let pending = active.filter((r) => r.callId);
  while (pending.length > 0 && Date.now() < deadline) {
    await sleep(pollIntervalMs);
    await Promise.all(pending.map(async (r) => {
      try {
        const st = readStatus(await client.checkCallStatus(r.callId));
        if (st.status) r.status = st.status;
        if (st.summary) r.summary = st.summary;
        if (st.durationSeconds != null) r.durationSeconds = st.durationSeconds;
        if (st.recordingUrl) r.recordingUrl = st.recordingUrl;
        if (st.pendingQuestion && st.pendingQuestion !== r.pendingQuestion) {
          r.pendingQuestion = st.pendingQuestion;
          log(`ask   ${r.name}: Kai is asking "${st.pendingQuestion}" (answer it in your KaiCalls dashboard or agent)`);
        }
      } catch (err) {
        r.lastPollError = err.message;
      }
    }));
    pending = pending.filter((r) => !TERMINAL_STATUSES.has(String(r.status).toLowerCase()));
  }
  for (const r of pending) r.status = `${r.status} (still running at timeout)`;

  for (const r of active) {
    if (!r.callId || pending.includes(r)) continue;
    try {
      const t = await client.getTranscript(r.callId);
      if (t.transcript) r.transcript = t.transcript;
      if (!r.summary && t.call?.summary) r.summary = t.call.summary;
    } catch { /* the summary from check_call_status is enough */ }
    r.answer = r.summary || r.reason || '';
    r.price = extractPrice(r.summary);
    ledger.update(r.to, { status: r.status });
  }
  for (const r of active) if (r.answer === undefined) r.answer = r.reason || '';

  return { runId, question, live, results: [...active, ...skipped] };
}
