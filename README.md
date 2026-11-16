# open-ask-for-me

**The open-source alternative to Google's "Ask for Me" and "Let Google Call": your agent calls local businesses and brings back the answers.**

Ask one question. It calls a few shops, asks each the same thing, and gives you a comparison table plus a short summary of every call.

```text
$ node bin/ask.mjs "How much to mount and balance 4 tires on a 2019 Civic? Any openings this week?" \
    --businesses shops.csv --live

| Business            | Phone        | Answer                                         | Price  | Status    |
| ------------------- | ------------ | ---------------------------------------------- | ------ | --------- |
| Example Tire Shop A | +19085550101 | $25 per tire to mount and balance. Open Thu.   | $25    | completed |
| Example Tire Shop B | +19085550102 | $89.99 for all four. Walk-ins Saturday.        | $89.99 | completed |
| Example Auto C      | +19735550103 | Won't quote by phone. Asked us to come in.     |        | completed |
```

(Example output with sample numbers.)

Zero dependencies. Node 18+. Works as a CLI, or as a skill for Claude Code and Codex.

## Quick start

1. **Get a KaiCalls key.** Sign up at [kaicalls.com](https://www.kaicalls.com/ai-agent-phone-number?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me). A new account's first call to a US or Canada business line is free.
2. **Set the key.**
   ```bash
   export KAICALLS_API_KEY=kc_live_...
   ```
3. **Run it.** Without `--live` it is a dry run and dials nothing.
   ```bash
   git clone https://github.com/KaiCalls/open-ask-for-me && cd open-ask-for-me
   node bin/ask.mjs "How much is a tire change?" --businesses examples/businesses.csv   # dry run
   node bin/ask.mjs "How much is a tire change?" --businesses shops.csv --live          # real calls
   ```

`--live` lists the calls it is about to place and waits for you to type `CALL`.

## Looking for…?

| You searched for | What it is | Where this fits |
| --- | --- | --- |
| Google "Ask for Me" / "Let Google Call" | A Google Search feature (US) where Google's AI calls local businesses for you and sends a summary of prices and availability. | Same idea, open source, and you choose the businesses, the question, and where the results go. |
| Bland Agent Phone | A Bland plan that gives an AI agent its own US phone number for calls and texts. | open-ask-for-me is a ready-made "call these shops and compare" job, not a phone number plan. |
| AgentPhone | A telephony API that gives AI agents phone numbers for voice and SMS. | Same: this repo is the finished errand, with guardrails, on top of a calling API. |

## Use it from your agent

### Claude Code

```bash
claude plugin marketplace add KaiCalls/kaicalls-plugin
claude plugin install kaicalls@kaicalls
```

Then copy `skills/ask-for-me/` into your project's `.claude/skills/` and ask:

> Get me 3 quotes for a tire change near 07924.

The skill tells the agent to search for shops, show you the list, wait for your OK, call through KaiCalls, and return the table.

### Codex and other MCP clients

Add KaiCalls as a Streamable HTTP MCP server:

```json
{
  "kaicalls": {
    "url": "https://www.kaicalls.com/api/mcp",
    "headers": { "Authorization": "Bearer kc_live_YOUR_KEY" }
  }
}
```

Then give the agent `skills/ask-for-me/SKILL.md`.

## Input

A CSV or JSON file with `name`, `phone`, and `state`:

```csv
name,phone,state
Example Tire Shop A,+19085550101,NJ
```

Or pass businesses inline, repeating the flag:

```bash
node bin/ask.mjs "Do you have size 225/45R17 in stock?" \
  --business "Example Tire Shop A|+19085550101|NJ" \
  --business "Example Tire Shop B|+19085550102|NJ"
```

| Flag | Default | What it does |
| --- | --- | --- |
| `--live` | off | Place real calls. Without it, nothing is dialed. |
| `--max-calls <n>` | 3 | Most calls in one run. |
| `--out <file>` | `ask-results-<time>.json` | Results file with every call, summary, and transcript. |
| `--agent-id <id>` | account default | Which KaiCalls agent places the calls. |
| `--facts "<text>"` | none | Details the caller may share if the shop asks, such as "tires are new, size 215/55R16". Shops ask follow-up questions, so this gets you real answers. |
| `--poll-interval <sec>` | 10 | Seconds between status checks. |
| `--timeout <sec>` | 600 | Stop waiting after this long. |

## How it works

```text
question + businesses
        |
        v
  guardrails  ----> skipped (WA/CA, non-US/CA, already called, over --max-calls)
        |
        v
  dry run? ------> print the plan, dial nothing
        |
        v  --live, you type CALL
  ledger: record number  (~/.open-ask-for-me/called.json)
        |
        v
  KaiCalls  tools/call make_call  -->  Kai phones the business
        |
        v
  tools/call check_call_status  (poll until the call ends)
        |
        v
  tools/call get_transcript
        |
        v
  markdown table + per-call summaries + results JSON
```

The client speaks MCP (JSON-RPC over Streamable HTTP) to `https://www.kaicalls.com/api/mcp`. All argument names for KaiCalls live in one file, [`lib/kaicalls.mjs`](lib/kaicalls.mjs).

## Guardrails

These are enforced in code and covered by tests in [`test/`](test).

- **No calls to Washington or California businesses.** Checked by the state you give and by area code, so a WA or CA number is refused even if the state field says otherwise.
- **US and Canada business numbers only.** Other countries, other +1 countries, and 900 numbers are refused.
- **Never the same number twice.** Every dialed number is written to `~/.open-ask-for-me/called.json` before the call starts. A number in that file is skipped on every later run.
- **Dry run by default.** Real calls need `--live` and you typing `CALL` at the prompt.
- **At most 3 calls per run** unless you raise `--max-calls`.
- **Honest calls.** Kai says it is an assistant calling on behalf of a customer. The task tells it not to book, buy, or agree to anything, and not to share your personal details.
- **Retry-safe.** Each call carries an idempotency key, so a retried request does not place a second call.

KaiCalls adds its own rules on the server side, such as calling hours and not placing AI calls to personal cell phones.

## Powered by KaiCalls

[KaiCalls](https://www.kaicalls.com/ai-agent-phone-number?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me) gives your AI agent a phone. Its hosted MCP server lets an agent place and receive phone calls. This repo uses three of its tools: `make_call`, `check_call_status`, and `get_transcript`.

A new account's first call to a US or Canada business line is free. After that, calls run on a plan: see [pricing](https://www.kaicalls.com/pricing?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me).

## Tests

```bash
node --test
```

The tests run against a fake MCP server on localhost. They never reach the network or a phone.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with Google, Bland, or AgentPhone. "Ask for Me" and "Let Google Call" are names Google uses for its own features.
