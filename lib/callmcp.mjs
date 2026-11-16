// CallMCP client and the one place that maps this tool onto CallMCP tool arguments.
//
// Endpoint: https://callmcp.ai/mcp (same backend as https://www.kaicalls.com/api/mcp)
// Transport: Streamable HTTP, JSON-RPC 2.0 over POST. Auth: Authorization: Bearer kc_live_...
//
// Tool schemas this file is built against (read from the live tools/list on 2026-11-16):
//   make_call          input:  to (required, E.164), context, first_message, name, agent_id,
//                              idempotency_key, external_ref (<=200 chars), call_language, ...
//                      output: { success, error?, intent_id?, idempotency_key?, replayed?,
//                                call: { id, status, to, agent_id, business_id, ... } }
//   check_call_status  input:  call_id (required; also accepts the intent_id of a scheduled call)
//                      output: { success, error?, pending_question?, live_transcript?,
//                                call: { id, status, summary, duration_seconds, recording_url, ... } }
//   get_transcript     input:  call_id (required)
//                      output: { success, transcript_available, transcript, insights, call }
// If CallMCP changes an argument name, change it here and nowhere else.

import { createHash } from 'node:crypto';

export const DEFAULT_ENDPOINT = 'https://callmcp.ai/mcp';

// Statuses after which polling stops. Anything else is treated as still in progress.
export const TERMINAL_STATUSES = new Set([
  'completed', 'ended', 'failed', 'busy', 'no-answer', 'no_answer', 'canceled',
  'cancelled', 'voicemail', 'error', 'blocked', 'rejected',
]);

// The task Kai reads before dialing. Kai already introduces itself as an assistant
// calling for a customer; this keeps the task narrow.
export function buildContext(question, businessName, facts) {
  return [
    `You are an assistant calling ${businessName} on behalf of a customer.`,
    `Ask this question and get a specific answer: ${question}`,
    ...(facts ? [`Facts you can share if they ask: ${facts}`] : []),
    'If they ask something you do not know, do not put them on hold. Say the customer will confirm that detail, and ask for the price for the most common case or a price range instead.',
    'If they give a price, get the exact amount and what it includes.',
    'Ask about availability if it is relevant.',
    'Do not book, buy, or agree to anything. Do not share any personal details about the customer.',
    'Thank them and end the call once you have the answer.',
  ].join(' ');
}

export function idempotencyKey(to, question) {
  return 'oafm-' + createHash('sha256').update(`${to}\n${question}`).digest('hex').slice(0, 32);
}

// Arguments for make_call. This is the mapping to check if the schema changes.
export function makeCallArgs({ to, businessName, question, runId, agentId, facts }) {
  const args = {
    to,
    context: buildContext(question, businessName, facts),
    idempotency_key: idempotencyKey(to, question),
    external_ref: `open-ask-for-me:${runId}`.slice(0, 200),
  };
  if (agentId) args.agent_id = agentId;
  return args;
}

// Pull the call id (or scheduled intent id) and status out of a make_call result.
export function readMakeCall(sc) {
  return {
    callId: sc?.call?.id || sc?.intent_id || null,
    status: sc?.call?.status || (sc?.intent_id ? 'scheduled' : null),
  };
}

// Pull the useful parts out of a check_call_status result.
export function readStatus(sc) {
  return {
    status: sc?.call?.status || null,
    summary: sc?.call?.summary || null,
    durationSeconds: sc?.call?.duration_seconds ?? null,
    recordingUrl: sc?.call?.recording_url || null,
    pendingQuestion: sc?.pending_question?.question || null,
  };
}

export class McpError extends Error {}

export class CallMcpClient {
  constructor({ apiKey, endpoint = DEFAULT_ENDPOINT, fetchImpl = globalThis.fetch } = {}) {
    if (!apiKey) throw new McpError('CALLMCP_API_KEY is not set');
    this.apiKey = apiKey;
    this.endpoint = endpoint;
    this.fetch = fetchImpl;
    this.sessionId = null;
    this.nextId = 1;
    this.initialized = false;
  }

  async rpc(method, params, { notification = false } = {}) {
    const body = { jsonrpc: '2.0', method };
    if (params !== undefined) body.params = params;
    if (!notification) body.id = this.nextId++;
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${this.apiKey}`,
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const res = await this.fetch(this.endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;
    if (notification) return null;
    if (res.status === 401 || res.status === 403) {
      throw new McpError(`CallMCP rejected the API key (HTTP ${res.status})`);
    }
    const text = await res.text();
    if (!res.ok) throw new McpError(`CallMCP HTTP ${res.status}: ${text.slice(0, 300)}`);
    const msg = parseResponse(text, res.headers.get('content-type') || '');
    if (msg.error) throw new McpError(`CallMCP error ${msg.error.code}: ${msg.error.message}`);
    return msg.result;
  }

  async init() {
    if (this.initialized) return;
    await this.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'open-ask-for-me', version: '0.1.0' },
    });
    await this.rpc('notifications/initialized', undefined, { notification: true });
    this.initialized = true;
  }

  // Calls a tool and returns its structured result. Throws on protocol or tool errors.
  async callTool(name, args) {
    await this.init();
    const result = await this.rpc('tools/call', { name, arguments: args });
    let sc = result?.structuredContent;
    if (!sc && Array.isArray(result?.content)) {
      const textPart = result.content.find((c) => c.type === 'text');
      if (textPart) {
        try { sc = JSON.parse(textPart.text); } catch { sc = { success: !result.isError, text: textPart.text }; }
      }
    }
    if (result?.isError || sc?.success === false) {
      throw new McpError(`${name} failed: ${sc?.error || sc?.text || 'unknown error'}`);
    }
    return sc || {};
  }

  makeCall(args) { return this.callTool('make_call', args); }
  checkCallStatus(callId) { return this.callTool('check_call_status', { call_id: callId }); }
  getTranscript(callId) { return this.callTool('get_transcript', { call_id: callId }); }
}

// Accept either a plain JSON body or a text/event-stream body with one JSON-RPC message.
export function parseResponse(text, contentType) {
  if (contentType.includes('text/event-stream')) {
    const data = text.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim());
    for (let i = data.length - 1; i >= 0; i--) {
      try {
        const m = JSON.parse(data[i]);
        if (m.result !== undefined || m.error !== undefined) return m;
      } catch { /* keep looking */ }
    }
    throw new McpError('CallMCP stream had no JSON-RPC response');
  }
  return JSON.parse(text);
}
