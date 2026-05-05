/**
 * arenza-vercel-ai-sdk — Vercel AI SDK tools for the Arenza GEO platform.
 *
 * Drop the result of `arenzaTools(client)` into the `tools` field of
 * `streamText` / `generateText`. The agent (whether you're calling
 * OpenAI's GPT, Anthropic's Claude, Google's Gemini, xAI's Grok, or
 * any other model the AI SDK supports) gains 6 typed tools for reading
 * Arenza brand-visibility data — and 4 more write tools when you
 * opt-in via `{ includeWrite: true }`.
 *
 *     import { streamText } from 'ai';
 *     import { ArenzaMCPClient } from 'arenza-mcp-client';
 *     import { arenzaTools } from 'arenza-vercel-ai-sdk';
 *
 *     const client = new ArenzaMCPClient({ token: process.env.ARENZA_TOKEN! });
 *
 *     const result = streamText({
 *       model: openai('gpt-4o-mini'),
 *       tools: arenzaTools(client),
 *       prompt: 'How are we doing on AI search this week?',
 *     });
 *
 * For non-AI-SDK consumers, use `arenza-mcp-client` directly.
 */

export { arenzaTools } from './tools.js';
export type { ArenzaToolsOptions, ArenzaToolSet } from './tools.js';
