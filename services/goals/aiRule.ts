/**
 * Writing a goal's rule from plain language with an LLM (ENG-260).
 *
 * The model only writes: ruleAuthoringMessages tells it the rule language
 * (rules.ts) and the user's trackers, and parseDraft turns its reply into a
 * rule that passed parseRule, or says why not (the reason goes back to the
 * model for one repair). Whether a goal is met is never asked of the model:
 * evaluate.ts decides it from the data.
 *
 * Only the user's sentence, the goal's currency and the names and kinds of
 * their trackers are sent; no financial data.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

import { parseRule, ruleLeaves, type RuleNode } from "./rules";

/** A tracker the model may name, by id. */
export interface DraftTracker {
  id: string;
  name: string;
  kind: "count" | "measurement";
  unit?: string;
}

/** A tracker the rule needs that does not exist yet, named `new:<n>` in it. */
export interface NewTracker {
  ref: string;
  name: string;
  kind: "count" | "measurement";
  unit?: string;
}

export interface RuleDraft {
  rule: RuleNode;
  /** One or two sentences restating the rule, in the user's language */
  summary: string;
  newTrackers: NewTracker[];
  /** Parts of the request no check can express, in the user's language */
  unsupported: string[];
}

export const NEW_TRACKER_PREFIX = "new:";
export const DRAFT_TEXT_MAX = 1000;

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

const LANGUAGE = `A rule is JSON. A group is {"kind":"all"|"any","children":[...]} or {"kind":"atLeast","count":n,"children":[...]} (1-10 children, nesting at most 4 deep, at most 20 checks in total). A check is one of:
- {"kind":"invested","target":T}: net NEW money put into investments since the goal started.
- {"kind":"gains","target":T}: unrealised investment gains since the goal started.
  T is {"kind":"priceMultiple","multiple":m} (m times the goal's price) or {"kind":"amount","amount":a} (a fixed amount in the goal's currency).
- {"kind":"netWorth","amount":a}: net worth of at least a (goal's currency).
- {"kind":"cooldown","days":d}: wait d whole days after the goal starts.
- {"kind":"counter","trackerId":id,"count":n}: n logged entries of a count tracker since the start.
- {"kind":"streak","trackerId":id,"perPeriod":n,"period":"week"|"month","periods":k}: a count tracker logged at least n times per week/month for k consecutive periods.
- {"kind":"checklist","items":[{"id":"s1","label":"..."}]}: one-off steps the user ticks.
- {"kind":"measurement","trackerId":id,"comparison":"atLeast"|"atMost","value":x,"basis":"best"|"latest"}: a measurement tracker's best or latest reading against x.
All numbers are positive. Days and periods are whole numbers.`;

/** The messages that ask the model for a rule draft. */
export function ruleAuthoringMessages(input: {
  text: string;
  currency: string;
  language: string;
  trackers: readonly DraftTracker[];
}): ChatMessage[] {
  const trackers =
    input.trackers.length === 0
      ? "The user has no trackers yet."
      : input.trackers
          .map((t) => `- id "${t.id}": ${t.name} (${t.kind}${t.unit ? `, ${t.unit}` : ""})`)
          .join("\n");
  const system = `You turn a person's description of how they want to earn a purchase into a rule for the Fiscalis finance app. You only write the rule; the app checks it against their data.

${LANGUAGE}

The user's trackers:
${trackers}

Use an existing tracker when it fits. When the rule needs a tracker that does not exist, use the id "${NEW_TRACKER_PREFIX}1", "${NEW_TRACKER_PREFIX}2", ... and describe it under newTrackers. Use "invested" for "invest/save into investments", "gains" for "returns/profits/capital gains". If something cannot be expressed, leave it out and list it under unsupported.

Reply with ONLY a JSON object, no prose and no code fence:
{"rule": <rule>, "summary": "<one or two sentences restating the rule, in ${input.language}>", "newTrackers": [{"ref":"${NEW_TRACKER_PREFIX}1","name":"...","kind":"count"|"measurement","unit":"..."}], "unsupported": ["<in ${input.language}>"]}`;
  // One user message: some OpenAI-compatible proxies (cliproxy on a
  // subscription account) replace the system prompt with their own
  return [
    {
      role: "user",
      content: `${system}

Goal currency: ${input.currency}
How I want to earn it:
"""
${input.text.trim().slice(0, DRAFT_TEXT_MAX)}
"""`,
    },
  ];
}

/** The JSON object in a reply, tolerating a code fence or prose around it. */
function extractJson(content: string): unknown {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object");
  return JSON.parse(content.slice(start, end + 1));
}

function shortText(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

/**
 * The model's reply as a draft whose rule passed parseRule and whose
 * trackers all exist or are declared, of the kind each check reads; or
 * the reason it is not one.
 */
export function parseDraft(
  content: string,
  trackers: readonly DraftTracker[],
): { ok: true; draft: RuleDraft } | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = extractJson(content);
  } catch {
    return { ok: false, reason: "The reply was not a JSON object." };
  }
  if (typeof raw !== "object" || raw === null) {
    return { ok: false, reason: "The reply was not a JSON object." };
  }
  const obj = raw as Record<string, unknown>;
  const parsed = parseRule(obj.rule);
  if (!parsed.ok) {
    return { ok: false, reason: `rule.${parsed.path || ""}: ${parsed.reason}`.replace(/\.:/, ":") };
  }

  const declared: NewTracker[] = [];
  for (const t of Array.isArray(obj.newTrackers) ? obj.newTrackers : []) {
    if (typeof t !== "object" || t === null) continue;
    const r = t as Record<string, unknown>;
    const ref = shortText(r.ref, 40);
    const name = shortText(r.name, 120);
    if (!ref?.startsWith(NEW_TRACKER_PREFIX) || !name) continue;
    if (r.kind !== "count" && r.kind !== "measurement") continue;
    declared.push({ ref, name, kind: r.kind, unit: shortText(r.unit, 24) });
  }

  const kindOf = new Map<string, "count" | "measurement">([
    ...trackers.map((t) => [t.id, t.kind] as const),
    ...declared.map((t) => [t.ref, t.kind] as const),
  ]);
  for (const leaf of ruleLeaves(parsed.rule)) {
    if (!("trackerId" in leaf)) continue;
    const kind = kindOf.get(leaf.trackerId);
    if (!kind) return { ok: false, reason: `Unknown trackerId "${leaf.trackerId}".` };
    const wanted = leaf.kind === "measurement" ? "measurement" : "count";
    if (kind !== wanted) {
      return { ok: false, reason: `A ${leaf.kind} check needs a ${wanted} tracker, "${leaf.trackerId}" is a ${kind}.` };
    }
  }
  const used = new Set(ruleLeaves(parsed.rule).flatMap((l) => ("trackerId" in l ? [l.trackerId] : [])));

  return {
    ok: true,
    draft: {
      rule: parsed.rule,
      summary: shortText(obj.summary, 400) ?? "",
      newTrackers: declared.filter((t) => used.has(t.ref)),
      unsupported: (Array.isArray(obj.unsupported) ? obj.unsupported : [])
        .map((u) => shortText(u, 200))
        .filter((u): u is string => u !== undefined)
        .slice(0, 5),
    },
  };
}

/** The rule with each `new:<n>` tracker replaced by the id it was created with. */
export function withCreatedTrackers(rule: RuleNode, ids: ReadonlyMap<string, string>): RuleNode {
  return JSON.parse(
    JSON.stringify(rule, (key, value) =>
      key === "trackerId" && typeof value === "string" && ids.has(value) ? ids.get(value) : value,
    ),
  ) as RuleNode;
}
