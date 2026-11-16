---
name: ask-for-me
description: Phone local businesses for the user and bring back their answers as a comparison table. Use when the user asks you to call shops, get quotes, check prices, stock, or availability at nearby businesses (for example "get me 3 quotes for a tire change near 07924"). Places real calls through KaiCalls (KaiCalls), so it always confirms the list with the user first.
---

# Ask for me

You find local businesses, confirm the list with the user, call each one with the same question through KaiCalls, and return a comparison table.

Every call rings a real business. Follow the steps in order. Do not skip the confirmation.

## 1. Connect KaiCalls (once)

Check whether the KaiCalls tools are available (`make_call`, `check_call_status`, `get_transcript`). If not, tell the user how to add them and stop until they do:

- Claude Code plugin:
  ```bash
  claude plugin marketplace add KaiCalls/kaicalls-plugin
  claude plugin install kaicalls@kaicalls
  ```
  Then run `/kaicalls:connect` in a new session.
- Any MCP client: add a Streamable HTTP server at `https://www.kaicalls.com/api/mcp` with the header `Authorization: Bearer kc_live_...`, or sign in with OAuth.
- No key yet: https://www.kaicalls.com/ai-agent-phone-number?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me

A new account's first call to a US or Canada business line is free. After that, calls need a plan (https://www.kaicalls.com/pricing). Do not quote prices.

## 2. Pin down the question

Write one short question that every business can answer the same way. Include the details a shop needs to quote: vehicle, size, service, date range. Example: "How much is it to mount and balance four tires on a 2019 Honda Civic, and do you have an opening this week?"

## 3. Find candidates

Use web search to find businesses near the user's location. For each one, get the name, the main business phone number from the business's own website or listing, the city, and the state. Prefer businesses that are open now or soon.

## 4. Apply the guardrails

Drop a business, and tell the user why, if any of these is true:

- It is in Washington (WA) or California (CA), by stated address **or** by area code. WA area codes: 206, 253, 360, 425, 509, 564. CA area codes: 209, 213, 279, 310, 323, 341, 350, 369, 408, 415, 424, 442, 510, 530, 559, 562, 619, 626, 628, 650, 657, 661, 669, 707, 714, 738, 747, 760, 805, 818, 820, 831, 840, 858, 909, 916, 925, 949, 951.
- The number is not a US or Canada number.
- The number looks like a personal cell phone rather than a business line.
- You or the user already called this number for this kind of request. Never call the same number twice.

Call at most 3 businesses unless the user asks for more.

## 5. Confirm with the user

Show the final list (name, phone, city/state) and the exact question. Ask the user to confirm. Place no call until the user says yes in this conversation.

## 6. Call

For each confirmed business, call `make_call` with:

- `to`: the number in E.164 format, for example `+19085550101`
- `context`: "You are an assistant calling <business> on behalf of a customer. Ask this question and get a specific answer: <question>. If they give a price, get the exact amount and what it includes. Do not book, buy, or agree to anything. Do not share any personal details about the customer."
- `idempotency_key`: a stable key per number and question, so a retry never places a second call
- `external_ref`: a short reference for this request

Kai opens each call by saying it is an assistant calling for a customer. Do not tell it to hide that.

## 7. Collect answers

Poll `check_call_status` with each `call_id` until the call ends. If `make_call` returned an `intent_id` instead (the call was scheduled for calling hours), tell the user when it goes out. If `pending_question` appears, relay the question to the user. When a call ends, read `call.summary`, and use `get_transcript` if you need detail.

## 8. Report

Return a markdown table, then one or two lines per call:

| Business | Phone | Answer | Price | Status |
| --- | --- | --- | --- | --- |

Quote prices exactly as the business said them. If a business would not give a price, say so. Do not guess or average. End with which option looks best for the user's stated need and why, in one sentence.

## CLI alternative

The same flow runs from a terminal with the open-source CLI in this repo:

```bash
node bin/ask.mjs "<question>" --businesses shops.csv          # dry run
KAICALLS_API_KEY=kc_live_... node bin/ask.mjs "<question>" --businesses shops.csv --live
```
