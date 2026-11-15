/**
 * Writing a goal's rule from plain language (ENG-260). The model only
 * writes the rule (services/goals/aiRule.ts); the app evaluates it.
 *
 * The provider is any OpenAI-compatible chat completions endpoint, set by
 * three environment variables, so it can be swapped without a code change:
 *
 *   GOALS_LLM_BASE_URL  e.g. https://cliproxy.example (no trailing /v1)
 *   GOALS_LLM_API_KEY   bearer token
 *   GOALS_LLM_MODEL     e.g. claude-sonnet-5-5
 *
 * Without them the action answers { ok: false, reason: "unavailable" } and
 * the editor hides the assistant. Only the user's sentence, the goal's
 * currency, the UI language and the names and kinds of their trackers are
 * sent; no financial data. Calls are rate limited per user.
 */

import { v } from "convex/values";
import { action, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./lib/auth";
import { enforceUserRateLimit } from "./lib/rateLimit";
import { describeError } from "../../services/security/providerError";
import {
  DRAFT_TEXT_MAX,
  parseDraft,
  ruleAuthoringMessages,
  type ChatMessage,
  type DraftTracker,
  type RuleDraft,
} from "../../services/goals/aiRule";

const TIMEOUT_MS = 45_000;
/** Attempts per request: the first answer, and one repair of an invalid one */
const ATTEMPTS = 2;

/** The caller's trackers as the model may name them. */
export const trackersFor = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }): Promise<DraftTracker[]> => {
    const rows = await ctx.db
      .query("goalTrackers")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return rows.map((t) => ({ id: t._id, name: t.name, kind: t.kind, unit: t.unit }));
  },
});

function config() {
  const baseUrl = process.env.GOALS_LLM_BASE_URL?.replace(/\/+$/, "");
  const apiKey = process.env.GOALS_LLM_API_KEY;
  const model = process.env.GOALS_LLM_MODEL;
  return baseUrl && apiKey && model ? { baseUrl, apiKey, model } : null;
}

async function complete(
  cfg: NonNullable<ReturnType<typeof config>>,
  messages: ChatMessage[],
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.model, messages, temperature: 0, max_tokens: 2000 }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("LLM reply without content");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Whether the assistant is configured on this deployment. */
export const available = action({
  args: {},
  handler: async (ctx): Promise<boolean> => {
    await requireUserId(ctx);
    return config() !== null;
  },
});

/**
 * A rule drafted from the user's own words, validated like a stored one,
 * for the editor to show and the user to confirm. Never stored here.
 */
export const draftRule = action({
  args: { text: v.string(), currency: v.string(), language: v.string() },
  handler: async (
    ctx,
    { text, currency, language },
  ): Promise<
    | { ok: true; draft: RuleDraft }
    | { ok: false; reason: "unavailable" | "invalidText" | "failed" }
  > => {
    const userId = await requireUserId(ctx);
    const cfg = config();
    if (!cfg) return { ok: false, reason: "unavailable" };
    const trimmed = text.trim();
    if (trimmed.length < 3 || trimmed.length > DRAFT_TEXT_MAX) return { ok: false, reason: "invalidText" };
    await enforceUserRateLimit(ctx, "goalRuleDraft", userId);

    const trackers = await ctx.runQuery(internal.goalsAi.trackersFor, { userId });
    const messages = ruleAuthoringMessages({
      text: trimmed,
      currency: currency.slice(0, 3),
      language: language.slice(0, 16),
      trackers,
    });
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      let content: string;
      try {
        content = await complete(cfg, messages);
      } catch (error) {
        console.error("goalsAi.draftRule: provider call failed", describeError(error));
        return { ok: false, reason: "failed" };
      }
      const parsed = parseDraft(content, trackers);
      if (parsed.ok) return parsed;
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content: `That is not valid: ${parsed.reason} Reply with the corrected JSON object only.`,
        },
      );
    }
    return { ok: false, reason: "failed" };
  },
});
