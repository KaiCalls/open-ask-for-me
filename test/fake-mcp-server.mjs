// A local stand-in for CallMCP. It speaks JSON-RPC over HTTP on localhost,
// answers make_call / check_call_status / get_transcript with the same shapes as the
// live server, and never touches a phone network.
import { createServer } from 'node:http';

export async function startFakeMcp({ apiKey = 'kc_live_test', answers = {}, failNumbers = [], sse = false, pollsUntilDone = 1 } = {}) {
  const state = { calls: new Map(), requests: [], makeCalls: [] };
  let n = 0;

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      const msg = JSON.parse(body || '{}');
      state.requests.push({ headers: req.headers, msg });
      if (req.headers.authorization !== `Bearer ${apiKey}`) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: msg.id ?? null, error: { code: -32001, message: 'Unauthorized' } }));
        return;
      }
      if (msg.id === undefined) { res.writeHead(202); res.end(); return; }

      let result;
      if (msg.method === 'initialize') {
        res.setHeader('mcp-session-id', 'fake-session-1');
        result = { protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'fake-callmcp', version: '0' } };
      } else if (msg.method === 'tools/call') {
        result = handleTool(msg.params.name, msg.params.arguments || {});
      } else {
        send(res, { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
        return;
      }
      send(res, { jsonrpc: '2.0', id: msg.id, result });
    });
  });

  function send(res, payload) {
    if (sse) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end(`event: message\ndata: ${JSON.stringify(payload)}\n\n`);
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(payload));
    }
  }

  function toolResult(sc) {
    return { content: [{ type: 'text', text: JSON.stringify(sc) }], structuredContent: sc, isError: sc.success === false };
  }

  function handleTool(name, args) {
    if (name === 'make_call') {
      state.makeCalls.push(args);
      if (failNumbers.includes(args.to)) return toolResult({ success: false, error: 'Call blocked' });
      const id = `call_${++n}`;
      state.calls.set(id, { id, to: args.to, polls: 0 });
      return toolResult({ success: true, idempotency_key: args.idempotency_key, call: { id, status: 'queued', to: args.to, agent_id: 'agent_1', business_id: 'biz_1' } });
    }
    if (name === 'check_call_status') {
      const c = state.calls.get(args.call_id);
      if (!c) return toolResult({ success: false, error: 'Call not found' });
      c.polls++;
      if (c.polls < pollsUntilDone) {
        return toolResult({ success: true, live_transcript: [{ speaker: 'kai', text: 'Hi, I am an assistant calling for a customer.' }], pending_question: null, call: { id: c.id, status: 'in-progress', summary: null } });
      }
      const summary = answers[c.to] ?? 'They did not give a price.';
      return toolResult({ success: true, live_transcript: null, pending_question: null, call: { id: c.id, status: 'completed', summary, duration_seconds: 62, recording_url: null } });
    }
    if (name === 'get_transcript') {
      const c = state.calls.get(args.call_id);
      return toolResult({ success: true, transcript_available: true, transcript: `Kai: Hi, I'm an assistant calling on behalf of a customer.\nShop: ${answers[c?.to] ?? ''}`, call: { id: args.call_id } });
    }
    return toolResult({ success: false, error: `unknown tool ${name}` });
  }

  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/mcp`,
    state,
    close: () => new Promise((r) => server.close(r)),
  };
}
