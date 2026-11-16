// Turn call results into a markdown comparison table.

const PRICE_RE = /\$\s?\d[\d,]*(?:\.\d{1,2})?/g;

// First dollar amounts mentioned in a summary, e.g. "$89" or "$89 - $120".
export function extractPrice(text) {
  if (!text) return '';
  const found = text.match(PRICE_RE);
  if (!found) return '';
  return [...new Set(found.map((p) => p.replace(/\s/g, '')))].slice(0, 2).join(' - ');
}

function cell(v) {
  return String(v ?? '').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim();
}

function shorten(s, n = 140) {
  const t = cell(s);
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
}

export function renderTable(results) {
  const lines = [
    '| Business | Phone | Answer | Price | Status |',
    '| --- | --- | --- | --- | --- |',
  ];
  for (const r of results) {
    lines.push(`| ${cell(r.name)} | ${cell(r.to || r.phone)} | ${shorten(r.answer || r.reason || '')} | ${cell(r.price || '')} | ${cell(r.status)} |`);
  }
  return lines.join('\n');
}

export function renderTranscriptSummaries(results) {
  const done = results.filter((r) => r.summary || r.transcript);
  if (done.length === 0) return '';
  const parts = ['', '## Per-call summaries', ''];
  for (const r of done) {
    parts.push(`### ${r.name} (${r.to})`);
    parts.push('');
    parts.push(r.summary || '(no summary returned)');
    if (r.recordingUrl) parts.push('', `Recording: ${r.recordingUrl}`);
    parts.push('');
  }
  return parts.join('\n');
}
