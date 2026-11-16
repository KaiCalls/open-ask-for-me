# Open-source alternative to Google "Ask for Me" and "Let Google Call"

Google's AI calling feature phones local businesses for you and sends back a summary. open-ask-for-me does the same job from your terminal or your own AI agent, and the code is open.

Not affiliated with Google.

## What Google's feature does

These facts come from the sources linked below.

- **January 30, 2025: "Ask for Me" in Search Labs.** Google tested a feature that calls local businesses on your behalf and sends you a summary of prices and availability. It started with nail salons and auto shops, for users who opted into Search Labs. ([TechCrunch](https://techcrunch.com/2025/01/30/googles-ask-for-me-feature-calls-businesses-on-your-behalf-to-inquire-about-services-pricing/))
- **July 16, 2025: rollout to US Search users.** Google began rolling out AI business calling to all Search users in the US. You search for something like "pet groomers near me," pick "Have AI check pricing," and answer a few questions. Google AI Pro and AI Ultra subscribers get higher limits. Each call starts by announcing an automated system calling from Google on behalf of a user. ([TechCrunch](https://techcrunch.com/2025/07/16/google-rolls-out-ai-powered-business-calling-feature-brings-gemini-2-5-pro-to-ai-mode))
- **November 13, 2025: "Let Google Call" for shopping.** For "near me" product searches in categories like toys, health and beauty, and electronics, Google can call stores to ask about stock, price, and promotions. It is built on Google's Duplex technology, rolling out in the US, and retailers can opt out. ([TechCrunch](https://techcrunch.com/2025/11/13/google-expands-ai-shopping-with-conversational-search-agentic-checkout-and-an-ai-that-calls-stores-for-you), [Google](https://blog.google/products/shopping/how-to-agentic-calling-let-google-call/))
- **Results** arrive as a summary by text, email, or both. ([Google](https://blog.google/products/shopping/how-to-agentic-calling-let-google-call/))

## How they compare

| | Google "Ask for Me" / "Let Google Call" | open-ask-for-me |
| --- | --- | --- |
| Where you start | Google Search | Terminal, Claude Code, Codex, or any MCP client |
| Which businesses | Google picks from its results | You (or your agent) pick, and you confirm the list |
| What it asks | Google's question flow for supported categories | Any question you write |
| Where results go | Text or email summary | Markdown table, per-call summaries, and a JSON file |
| Source code | Closed | Open, MIT |
| Who places the call | Google | Kai, through CallMCP |
| Cost | Free inside Google Search | First call for a new CallMCP connector account is free, then a CallMCP plan |
| Availability | US | Calls to US and Canada business lines, excluding WA and CA in this repo |

## When to use which

Use Google's feature if you are already in Search, your request fits one of its categories, and a text summary is enough.

Use open-ask-for-me if you want to choose the businesses yourself, ask a question Google's flow does not cover, feed the answers into your own agent or spreadsheet, or read and change the code.

## Try it

```bash
git clone https://github.com/KaiCalls/open-ask-for-me && cd open-ask-for-me
node bin/ask.mjs "How much is a tire change?" --businesses examples/businesses.csv
```

That is a dry run. To place real calls, [get a CallMCP key](https://callmcp.ai/?utm_source=github&utm_medium=oss&utm_content=open-ask-for-me), set `CALLMCP_API_KEY`, and add `--live`.
