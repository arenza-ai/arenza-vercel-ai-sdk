# arenza-vercel-ai-sdk

> Vercel AI SDK tools for **Arenza** — drop-in tools you can pass to `streamText` / `generateText` so any agent (powered by ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok, or any other model the AI SDK supports) gains typed access to AI visibility metrics, GEO opportunities, and brand mention data.

[Arenza](https://arenza.ai) is a Generative Engine Optimization (GEO) platform that measures how 6 leading AI assistants describe brands. This package wraps the [Arenza MCP server](https://mcp.arenza.ai) as a [Vercel AI SDK](https://ai-sdk.dev) `ToolSet` so your existing chat UI, agent loop, or background worker can answer "how does ChatGPT describe my brand?" without wiring custom routes.

## Why an Arenza tool plugin (not just a fetch loop)

AI SDK agents that need to answer "how does ChatGPT describe my brand?" or "what should we fix this week to improve our AI search ranking?" benefit from a tool with a tight Zod schema and a clear, GEO-vocabulary description. Hand-rolling fetch calls inside a `streamText` step loses the structured-tool affordance, breaks tool-call repair, and forces every developer to re-derive the same parameter shapes.

## Install

```bash
npm install @arenza/vercel-ai-sdk arenza-mcp-client ai
# or
pnpm add @arenza/vercel-ai-sdk arenza-mcp-client ai
```

`ai` is a peer dependency (`>=4.0.0`). Install whichever version your app already uses.

## Quick start (Next.js app router)

```ts
// app/api/chat/route.ts
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ArenzaMCPClient } from '@arenza/mcp-client';
import { arenzaTools } from '@arenza/vercel-ai-sdk';

const client = new ArenzaMCPClient({ token: process.env.ARENZA_TOKEN! });

export async function POST(req: Request) {
  const { messages } = await req.json();
  const result = streamText({
    model: openai('gpt-4o-mini'),
    tools: arenzaTools(client),
    messages,
  });
  return result.toUIMessageStreamResponse();
}
```

The agent will call `arenza_list_brands`, `arenza_get_brand_overview`, `arenza_list_opportunities`, etc. on its own as it needs the data.

## Quick start (vanilla, single shot)

```ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { ArenzaMCPClient } from '@arenza/mcp-client';
import { arenzaTools } from '@arenza/vercel-ai-sdk';

const client = new ArenzaMCPClient({ token: process.env.ARENZA_TOKEN! });

const { text, toolCalls } = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: arenzaTools(client),
  prompt: 'Which of our brands has the worst share of voice on Perplexity, and what wrong claims are hurting it most?',
  // optional: maxSteps: 5,  // let the agent take multiple tool calls
});

console.log(text);
console.log(toolCalls);  // shows which Arenza tools the model picked
```

## Tools exposed

`arenzaTools(client)` returns an AI SDK `ToolSet` with 6 read-only tools by default:

| Tool name | What it does |
|---|---|
| `arenza_list_brands` | Enumerate brands in the tenant portfolio. |
| `arenza_get_brand_overview` | Share-of-voice + wrong-claim count + per-LLM mentions for one brand. |
| `arenza_list_prompts` | The buyer-perspective prompts being probed for a brand, with mention rate per LLM. |
| `arenza_list_opportunities` | Open GEO opportunities (wrong_claim, missing_canonical_page, listicle_gap, discussion_seed) with severity. |
| `arenza_suggest_competitors` | LLM-suggested competitors to add to tracking. |
| `arenza_suggest_prompts` | LLM-generated buyer-perspective prompts (70%+ unbranded ratio enforced). |

Pass `{ includeWrite: true }` to also get 4 write tools:

| Tool name | What it does |
|---|---|
| `arenza_add_competitor` | Add a competitor to a brand's tracking list. |
| `arenza_dismiss_competitor` | Remove a competitor (e.g. wrong suggestion). |
| `arenza_mark_opportunity_done` | Mark a GEO opportunity as completed. |
| `arenza_generate_geo_article` | Draft a canonical-fact article anchored to a specific finding. |

Write tools are opt-in because chat agents can be aggressive about side effects — you usually want a human in the loop before mutating tracking config.

## Schemas

Each tool ships a Zod `inputSchema` that the AI SDK forwards to the model as JSON Schema. For example:

```ts
// arenza_list_opportunities inputSchema
z.object({
  brand_id: z.string(),
  type: z.enum(['wrong_claim', 'missing_canonical_page', 'listicle_gap', 'discussion_seed']).optional(),
})
```

The descriptions are deliberately GEO-vocabulary-heavy (mentioning ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok by name; mentioning "share of voice", "hallucinations", "AI visibility") so when an agent's prompt mentions any of those terms the tool router has high signal.

## Authentication

Pass an Arenza API token to the client:

```ts
const client = new ArenzaMCPClient({ token: process.env.ARENZA_TOKEN! });
```

Get a token at [app.arenza.ai/settings/api](https://app.arenza.ai/settings/api). For multi-tenant deployments, swap to OAuth — the MCP server publishes its OAuth metadata at [`mcp.arenza.ai/.well-known/oauth-authorization-server`](https://mcp.arenza.ai/.well-known/oauth-authorization-server).

## Pattern: GEO copilot inside your existing AI SDK chat

If you already have an AI SDK chat route, drop the read-only Arenza tools into the existing tool set — your agent now answers "how am I doing on AI search?" without you wiring custom UI:

```ts
const result = streamText({
  model,
  tools: {
    ...yourExistingTools,
    ...arenzaTools(client),  // adds 6 GEO tools
  },
  messages,
});
```

## Pattern: weekly GEO triage worker

```ts
import { generateText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { ArenzaMCPClient } from '@arenza/mcp-client';
import { arenzaTools } from '@arenza/vercel-ai-sdk';

export async function weeklyTriage() {
  const client = new ArenzaMCPClient({ token: process.env.ARENZA_TOKEN! });
  const { text } = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    tools: arenzaTools(client, { includeWrite: true }),
    system:
      'You are a GEO marketing triage agent. Each Monday you review the Arenza portfolio. ' +
      'For every brand: list overview, list critical-severity opportunities, draft canonical articles ' +
      'for any wrong-claim opportunity that is older than 7 days, and produce a one-paragraph human summary.',
    prompt: 'Run this week\'s triage.',
  });
  await postToSlack(text);
}
```

Schedule with [Vercel Cron](https://vercel.com/docs/cron-jobs) and you have an autonomous GEO operations loop.

## Pattern: server-side scan inside a Server Action

```ts
'use server';

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { ArenzaMCPClient } from '@arenza/mcp-client';
import { arenzaTools } from '@arenza/vercel-ai-sdk';

export async function scanForUser(brandDomain: string) {
  const client = new ArenzaMCPClient({ token: process.env.ARENZA_TOKEN! });
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    tools: arenzaTools(client),
    prompt: `Scan ${brandDomain}, summarise the AI visibility findings (mentioning per-LLM mention rate across ChatGPT, Claude, Gemini, Perplexity, Copilot, Grok), and list the top 3 GEO opportunities.`,
  });
  return text;
}
```

## Related projects

- [`arenza-mcp-client`](https://github.com/arenza-ai/arenza-mcp-client-ts) — the typed TS client this wraps.
- [`arenza-mcp-client-python`](https://github.com/arenza-ai/arenza-mcp-client-python) — Python equivalent.
- [`arenza-cli`](https://github.com/arenza-ai/arenza-cli) — `npx arenza scan brand.com` for terminal scans.
- [`arenza-langchain`](https://github.com/arenza-ai/arenza-langchain) — same six tools wrapped for LangChain / LangGraph.
- [`arenza-llamaindex`](https://github.com/arenza-ai/arenza-llamaindex) — same for LlamaIndex.
- [`arenza-zapier-actions`](https://github.com/arenza-ai/arenza-zapier-actions) — Zapier integration manifest.
- [awesome-geo](https://github.com/arenza-ai/awesome-geo) — curated list of GEO and AI-visibility resources.

## Resources

- Arenza homepage: https://arenza.ai
- Long-form GEO guides: https://arenza.ai/guides
- AI brand reference: https://arenza.ai/llms.txt + https://arenza.ai/llms-full.txt
- MCP server: https://mcp.arenza.ai
- OAuth spec: https://mcp.arenza.ai/.well-known/oauth-authorization-server
- Vercel AI SDK docs: https://ai-sdk.dev

## License

MIT (c) 2026 Arenza
