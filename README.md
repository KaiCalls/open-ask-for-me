<h1 align="center">Stop calling around.</h1>

<p align="center"><b>open-ask-for-me</b> is the open-source "Ask for Me."<br>
Type one question. Your agent phones the shops, gets through the phone menus,<br>
asks every one the same thing, and hands you back a price table.</p>

<p align="center">
<img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue">
<img alt="Node 18+" src="https://img.shields.io/badge/node-18%2B-green">
<img alt="Zero dependencies" src="https://img.shields.io/badge/dependencies-0-brightgreen">
<img alt="Works with Claude Code and Codex" src="https://img.shields.io/badge/works%20with-Claude%20Code%20%C2%B7%20Codex-orange">
<a href="https://www.kaicalls.com/ai-agent-phone-number?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me"><img alt="Powered by KaiCalls" src="https://img.shields.io/badge/calls%20by-KaiCalls-black"></a>
</p>

---

**You:** "Get me 3 quotes to mount and balance 4 tires on a 2019 Civic. Any openings this week?"

**Your agent, a few minutes later:**

| Business            | Answer                                       | Price  |
| ------------------- | -------------------------------------------- | ------ |
| Example Tire Shop A | $25 per tire to mount and balance. Open Thu. | $25/tire |
| Example Tire Shop B | $89.99 for all four. Walk-ins Saturday.      | $89.99 |
| Example Auto C      | Won't quote by phone. Asked us to come in.   | —      |

<sub>Sample output. Every call also comes back with a summary and the full transcript.</sub>

No hold music. No "press 2 for service." No repeating the same question to three different people. You read one table and pick.

## Things to ask it

- "Who has 225/45R17 tires in stock today?"
- "What does a standard dental cleaning cost without insurance?"
- "Can the vet see a limping dog this afternoon?"
- "How much to rekey the locks on a 3-bedroom house?"
- "How long is the wait for a table for 6 tonight?"

If the answer lives in someone's head at a local business, your agent can go get it.

## Try it in 30 seconds

No key and no calls needed for the dry run:

```bash
git clone https://github.com/KaiCalls/open-ask-for-me && cd open-ask-for-me
node bin/ask.mjs "How much is a tire change?" --businesses examples/businesses.csv
```

Ready for real calls:

1. **Get a KaiCalls key** at [kaicalls.com](https://www.kaicalls.com/ai-agent-phone-number?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me). A new account's first call to a US or Canada business line is free.
2. `export KAICALLS_API_KEY=kc_live_...`
3. Add `--live`. It shows you every call it is about to place and waits for you to type `CALL`.

```bash
node bin/ask.mjs "How much is a tire change?" --businesses shops.csv --live --facts "tires are new, 215/55R16"
```

`--facts` gives the caller the details shops always ask about, so you get a real number back.

## Why not just use Google's?

Google's "Ask for Me" and "Let Google Call" do this inside Google Search. They're good. This is the version you control.

| | Google | open-ask-for-me |
| --- | --- | --- |
| Which businesses | Google's picks, in the categories Google supports | Any US or Canada business line you choose (except WA and CA) |
| What it asks | Google's form | Your exact question, in your words |
| Where answers go | A text or email from Google | A table, a JSON file, or straight back into your agent |
| Source | Closed | MIT, read every line |

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

## Built to be polite

Every rule below is enforced in code and covered by tests in [`test/`](test).

- **It never calls the same number twice.** Every number is logged to `~/.open-ask-for-me/called.json` before dialing.
- **Dry run by default.** Real calls need `--live` plus you typing `CALL`.
- **Small batches.** 3 calls per run unless you raise `--max-calls`.
- **It says who it is.** Kai introduces itself as an assistant calling for a customer. It never books, buys, agrees to anything, or shares your details.
- **Business lines only, US and Canada.** No other countries, no 900 numbers, and no Washington or California businesses (checked by state and by area code).
- **Retry-safe.** Each call carries an idempotency key, so a retry never dials twice.

KaiCalls adds its own server-side rules on top, like calling hours and no AI calls to personal cell phones.

## Looking for…?

| You searched for | What it is | Where this fits |
| --- | --- | --- |
| Google "Ask for Me" / "Let Google Call" | A Google Search feature (US) where Google's AI calls local businesses for you and sends a summary of prices and availability. | Same idea, open source, and you choose the businesses, the question, and where the results go. |
| Bland Agent Phone | A Bland plan that gives an AI agent its own US phone number for calls and texts. | open-ask-for-me is a ready-made "call these shops and compare" job, not a phone number plan. |
| AgentPhone | A telephony API that gives AI agents phone numbers for voice and SMS. | Same: this repo is the finished errand, with guardrails, on top of a calling API. |

## Powered by KaiCalls

[KaiCalls](https://www.kaicalls.com/ai-agent-phone-number?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me) gives your AI agent a phone. Its hosted MCP server is the calling engine here: this repo uses `make_call`, `check_call_status` and `get_transcript`.

Same key, more tricks: when a shop calls your number back, Kai answers and takes the message.

A new account's first call to a US or Canada business line is free. After that, calls run on a [plan](https://www.kaicalls.com/pricing?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me).

## Tests

```bash
node --test
```

The tests run against a fake MCP server on localhost. They never touch the network or a phone.

## License

MIT. See [LICENSE](LICENSE).

Not affiliated with Google, Bland, or AgentPhone. "Ask for Me" and "Let Google Call" are names Google uses for its own features.
