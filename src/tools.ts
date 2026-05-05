/**
 * Build a Vercel AI SDK `ToolSet` (a record of `Tool` instances) from
 * an `ArenzaMCPClient`. Each tool has a Zod `inputSchema`, a
 * GEO-keyword-rich `description`, and an `execute` function that
 * forwards to the typed MCP client.
 *
 * The result drops directly into `streamText({ tools })` /
 * `generateText({ tools })` / `Experimental_Agent({ tools })`.
 */

import { tool } from 'ai';
import type { Tool } from 'ai';
import type { ArenzaMCPClient } from 'arenza-mcp-client';
import { z } from 'zod';

export interface ArenzaToolsOptions {
  /** Include write tools (add_competitor, dismiss_competitor, mark_opportunity_done, generate_geo_article). Default: false. */
  includeWrite?: boolean;
}

/**
 * Concrete shape of the returned tool set. Vercel AI SDK accepts any
 * `ToolSet` (a record from string keys to `Tool`); this type is a loose
 * alias so consumers can spread it into their own tool sets.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ArenzaToolSet = Record<string, Tool<any, any>>;

/** Return the AI SDK tool set wrapping the Arenza MCP server. */
export function arenzaTools(
  client: ArenzaMCPClient,
  opts: ArenzaToolsOptions = {},
): ArenzaToolSet {
  const tools: ArenzaToolSet = {
    arenza_list_brands: tool({
      description:
        'List all brands tracked in the authenticated Arenza tenant. Returns brand id, name, domain, and region. Use this first when the user asks about "my brands", "the brands we track", or wants to know which company to drill into next.',
      inputSchema: z.object({}),
      execute: async () => {
        return await client.listBrands();
      },
    }),

    arenza_get_brand_overview: tool({
      description:
        'Aggregate AI visibility + accuracy snapshot for one brand. Returns share-of-voice, count of wrong claims (hallucinations), per-LLM mention counts across ChatGPT, Claude, Gemini, Perplexity, Copilot, and Grok, plus last-scan timestamp. Call this when the user asks how a brand is performing in AI search / GEO / LLM visibility.',
      inputSchema: z.object({
        brand_id: z.string().describe('Brand id from arenza_list_brands.'),
      }),
      execute: async ({ brand_id }) => {
        return await client.getBrandOverview({ brand_id });
      },
    }),

    arenza_list_prompts: tool({
      description:
        'List the AI prompts probed for a brand (the buyer-perspective questions Arenza asks every assistant). Each prompt comes back with its intent, branded/unbranded flag, and per-LLM mention rate. Use when the user asks "what questions are we measuring" or wants to find prompts where coverage is weak.',
      inputSchema: z.object({
        brand_id: z.string().describe('Brand id.'),
        intent: z
          .enum(['discovery', 'comparison', 'how_to', 'integration', 'pricing'])
          .optional()
          .describe('Optional intent filter.'),
      }),
      execute: async ({ brand_id, intent }) => {
        return await client.listPrompts({ brand_id, intent });
      },
    }),

    arenza_list_opportunities: tool({
      description:
        'List measurement-led GEO opportunities for a brand. Each opportunity is anchored to a specific finding (wrong_claim, missing_canonical_page, listicle_gap, discussion_seed) with a severity. This is the "what should we fix this week" list. Critical-severity opportunities usually represent hallucinated claims by ChatGPT/Claude/Gemini/Perplexity/Copilot/Grok that hurt buying decisions.',
      inputSchema: z.object({
        brand_id: z.string().describe('Brand id.'),
        type: z
          .enum(['wrong_claim', 'missing_canonical_page', 'listicle_gap', 'discussion_seed'])
          .optional()
          .describe('Optional opportunity type filter.'),
      }),
      execute: async ({ brand_id, type }) => {
        return await client.listOpportunities({ brand_id, type });
      },
    }),

    arenza_suggest_competitors: tool({
      description:
        'Get LLM-suggested competitors for a brand based on its description and category. Useful when setting up tracking for a new brand or when the user wants to know who else AI assistants might be comparing them against.',
      inputSchema: z.object({
        brand_id: z.string().describe('Brand id.'),
        count: z.number().int().min(1).max(20).optional().describe('How many to suggest (default 5).'),
      }),
      execute: async ({ brand_id, count }) => {
        return await client.suggestCompetitors({ brand_id, count });
      },
    }),

    arenza_suggest_prompts: tool({
      description:
        'Generate buyer-perspective prompts to add to a brand\'s tracking set. Arenza enforces a 70%+ unbranded ratio so the prompts measure real discovery, not vanity searches. Pass the competitor list to get comparison-style prompts ("X vs Y for use case Z").',
      inputSchema: z.object({
        brand_id: z.string().describe('Brand id.'),
        competitors: z
          .array(z.string())
          .optional()
          .describe('Competitor names to seed comparison prompts.'),
        count: z.number().int().min(1).max(50).optional(),
        locale: z.enum(['en', 'zh']).optional(),
      }),
      execute: async ({ brand_id, competitors, count, locale }) => {
        return await client.suggestPrompts({ brand_id, competitors, count, locale });
      },
    }),
  };

  if (opts.includeWrite) {
    tools.arenza_add_competitor = tool({
      description:
        'Add a competitor to a brand\'s tracking list. Subsequent AI visibility scans will compare share-of-voice against this competitor across ChatGPT, Claude, Gemini, Perplexity, Copilot, and Grok.',
      inputSchema: z.object({
        brand_id: z.string(),
        name: z.string().describe('Competitor name as it should appear in the dashboard.'),
        domain: z.string().describe('Competitor domain, e.g. "stripe.com".'),
      }),
      execute: async ({ brand_id, name, domain }) => {
        return await client.addCompetitor({ brand_id, name, domain });
      },
    });

    tools.arenza_dismiss_competitor = tool({
      description:
        'Remove a competitor from a brand\'s tracking list. Use when an LLM-suggested competitor turned out to be wrong or no longer relevant.',
      inputSchema: z.object({
        brand_id: z.string(),
        competitor_id: z.string(),
      }),
      execute: async ({ brand_id, competitor_id }) => {
        return await client.dismissCompetitor({ brand_id, competitor_id });
      },
    });

    tools.arenza_mark_opportunity_done = tool({
      description:
        'Mark a GEO opportunity as completed (e.g. you published the canonical page or got the wrong claim retracted). Arenza will re-verify on the next scan.',
      inputSchema: z.object({
        opportunity_id: z.string(),
      }),
      execute: async ({ opportunity_id }) => {
        return await client.markOpportunityDone({ opportunity_id });
      },
    });

    tools.arenza_generate_geo_article = tool({
      description:
        'Draft a canonical-fact article body anchored to a specific finding (linked_claim_id). Use to fix wrong_claim or missing_canonical_page opportunities. Output is a structured doc the marketing team can publish to correct hallucinations across ChatGPT, Claude, Gemini, Perplexity, Copilot, and Grok.',
      inputSchema: z.object({
        brand_id: z.string(),
        linked_claim_id: z.string().describe('Claim id from a list_opportunities result.'),
        locale: z.enum(['en', 'zh']).optional(),
      }),
      execute: async ({ brand_id, linked_claim_id, locale }) => {
        return await client.generateGeoArticle({ brand_id, linked_claim_id, locale });
      },
    });
  }

  return tools;
}
