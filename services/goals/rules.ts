/**
 * Goal rules: what has to be true before a goal (a car, a vacation) may be
 * bought (ENG-256).
 *
 * A rule is a tree. Groups combine children with `all`, `any` or
 * `atLeast(n)`; leaves are checks of one metric. Fiscalis tracks some
 * leaves itself and the user attests the others:
 *
 * - invested: net new money put into investments since the goal started,
 *   at least a multiple of the price or a fixed amount (consumed);
 * - gains: unrealised investment gains since the goal started (consumed);
 * - netWorth: net worth at least an amount (a condition);
 * - cooldown: the goal is at least N days old (a condition);
 * - counter: entries of an attested tracker, e.g. 150 workouts (consumed);
 * - streak: an attested tracker logged at least N times per week/month for
 *   K consecutive periods (a condition);
 * - checklist: one-off steps of this goal only (a condition);
 * - measurement: the latest or best reading of an attested tracker against
 *   a value, e.g. 10 km under 50 minutes (a condition).
 *
 * Amounts (fixed targets, net worth) are in the goal's own currency, like
 * its price; the evaluator converts both at the same rate.
 *
 * The tree is stored as plain data (Convex validators cannot express a
 * recursive type), so parseRule is the one gate every stored, edited or
 * AI-written rule passes through.
 *
 * Framework-free: imported by Convex functions and vitest.
 */

export type RuleTarget =
  | { kind: "priceMultiple"; multiple: number }
  | { kind: "amount"; amount: number };

export type CadencePeriod = "week" | "month";

export interface ChecklistItem {
  id: string;
  label: string;
}

export type RuleLeaf =
  | { kind: "invested"; target: RuleTarget }
  | { kind: "gains"; target: RuleTarget }
  | { kind: "netWorth"; amount: number }
  | { kind: "cooldown"; days: number }
  | { kind: "counter"; trackerId: string; count: number }
  | {
      kind: "streak";
      trackerId: string;
      perPeriod: number;
      period: CadencePeriod;
      periods: number;
    }
  | { kind: "checklist"; items: ChecklistItem[] }
  | {
      kind: "measurement";
      trackerId: string;
      comparison: "atLeast" | "atMost";
      value: number;
      basis: "latest" | "best";
    };

export type RuleGroup =
  | { kind: "all"; children: RuleNode[] }
  | { kind: "any"; children: RuleNode[] }
  | { kind: "atLeast"; count: number; children: RuleNode[] };

export type RuleNode = RuleLeaf | RuleGroup;

export type RuleLeafKind = RuleLeaf["kind"];

export const RULE_LEAF_KINDS = [
  "invested",
  "gains",
  "netWorth",
  "cooldown",
  "counter",
  "streak",
  "checklist",
  "measurement",
] as const satisfies readonly RuleLeafKind[];

/** Leaves Fiscalis measures itself; the others the user attests. */
export const TRACKED_LEAF_KINDS: readonly RuleLeafKind[] = [
  "invested",
  "gains",
  "netWorth",
  "cooldown",
];

/** Limits that keep a rule readable and its evaluation cheap. */
export const RULE_LIMITS = {
  maxDepth: 4,
  maxChildren: 10,
  maxLeaves: 20,
  maxChecklistItems: 20,
  maxLabelLength: 120,
  maxMultiple: 1000,
  maxAmount: 1e9,
  maxCount: 100_000,
  maxDays: 3650,
  maxPeriods: 520,
} as const;

export function isGroup(node: RuleNode): node is RuleGroup {
  return node.kind === "all" || node.kind === "any" || node.kind === "atLeast";
}

/** Every leaf of a rule, depth first, in order. */
export function ruleLeaves(node: RuleNode): RuleLeaf[] {
  return isGroup(node) ? node.children.flatMap(ruleLeaves) : [node];
}

/** The attested trackers a rule reads, each once. */
export function ruleTrackerIds(node: RuleNode): string[] {
  const ids = new Set<string>();
  for (const leaf of ruleLeaves(node)) {
    if ("trackerId" in leaf) ids.add(leaf.trackerId);
  }
  return [...ids];
}

/** The checklist items of a rule, across all its checklist leaves. */
export function ruleChecklistItemIds(node: RuleNode): string[] {
  return ruleLeaves(node).flatMap((leaf) =>
    leaf.kind === "checklist" ? leaf.items.map((i) => i.id) : [],
  );
}

// ═══════════════════════════════════════════════════════════════
// Parsing
// ═══════════════════════════════════════════════════════════════

export type ParseRuleResult =
  | { ok: true; rule: RuleNode }
  | {
      ok: false;
      /** Where the problem is, e.g. "children[1].target.multiple" */
      path: string;
      /** What is wrong, in English (for logs and the AI repair loop) */
      reason: string;
    };

class RuleError extends Error {
  constructor(
    readonly path: string,
    readonly reason: string,
  ) {
    super(`${path || "rule"}: ${reason}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function at(path: string, key: string | number): string {
  return typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key;
}

function positive(value: unknown, path: string, max: number, integer = false): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RuleError(path, "must be a positive number");
  }
  if (integer && !Number.isInteger(value)) {
    throw new RuleError(path, "must be a whole number");
  }
  if (value > max) throw new RuleError(path, `must be at most ${max}`);
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new RuleError(path, "must be a non-empty string");
  }
  const trimmed = value.trim();
  if (trimmed.length > RULE_LIMITS.maxLabelLength) {
    throw new RuleError(path, `must be at most ${RULE_LIMITS.maxLabelLength} characters`);
  }
  return trimmed;
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], path: string): T {
  if (typeof value !== "string" || !(allowed as readonly string[]).includes(value)) {
    throw new RuleError(path, `must be one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function parseTarget(value: unknown, path: string): RuleTarget {
  if (!isRecord(value)) throw new RuleError(path, "must be an object");
  const kind = oneOf(value.kind, ["priceMultiple", "amount"] as const, at(path, "kind"));
  return kind === "priceMultiple"
    ? {
        kind,
        multiple: positive(value.multiple, at(path, "multiple"), RULE_LIMITS.maxMultiple),
      }
    : { kind, amount: positive(value.amount, at(path, "amount"), RULE_LIMITS.maxAmount) };
}

function parseLeaf(node: Record<string, unknown>, path: string): RuleLeaf {
  const kind = oneOf(node.kind, RULE_LEAF_KINDS, at(path, "kind"));
  switch (kind) {
    case "invested":
    case "gains":
      return { kind, target: parseTarget(node.target, at(path, "target")) };
    case "netWorth":
      return { kind, amount: positive(node.amount, at(path, "amount"), RULE_LIMITS.maxAmount) };
    case "cooldown":
      return { kind, days: positive(node.days, at(path, "days"), RULE_LIMITS.maxDays, true) };
    case "counter":
      return {
        kind,
        trackerId: text(node.trackerId, at(path, "trackerId")),
        count: positive(node.count, at(path, "count"), RULE_LIMITS.maxCount),
      };
    case "streak":
      return {
        kind,
        trackerId: text(node.trackerId, at(path, "trackerId")),
        perPeriod: positive(node.perPeriod, at(path, "perPeriod"), RULE_LIMITS.maxCount),
        period: oneOf(node.period, ["week", "month"] as const, at(path, "period")),
        periods: positive(node.periods, at(path, "periods"), RULE_LIMITS.maxPeriods, true),
      };
    case "checklist": {
      const items = node.items;
      if (!Array.isArray(items) || items.length === 0) {
        throw new RuleError(at(path, "items"), "must list at least one item");
      }
      if (items.length > RULE_LIMITS.maxChecklistItems) {
        throw new RuleError(
          at(path, "items"),
          `must list at most ${RULE_LIMITS.maxChecklistItems} items`,
        );
      }
      return {
        kind,
        items: items.map((item, i) => {
          const p = at(at(path, "items"), i);
          if (!isRecord(item)) throw new RuleError(p, "must be an object");
          return { id: text(item.id, at(p, "id")), label: text(item.label, at(p, "label")) };
        }),
      };
    }
    case "measurement":
      return {
        kind,
        trackerId: text(node.trackerId, at(path, "trackerId")),
        comparison: oneOf(node.comparison, ["atLeast", "atMost"] as const, at(path, "comparison")),
        value: positive(node.value, at(path, "value"), RULE_LIMITS.maxAmount),
        basis: oneOf(node.basis, ["latest", "best"] as const, at(path, "basis")),
      };
  }
}

function parseNode(value: unknown, path: string, depth: number): RuleNode {
  if (!isRecord(value)) throw new RuleError(path, "must be an object");
  if (value.kind !== "all" && value.kind !== "any" && value.kind !== "atLeast") {
    return parseLeaf(value, path);
  }
  if (depth >= RULE_LIMITS.maxDepth) {
    throw new RuleError(path, `groups nest at most ${RULE_LIMITS.maxDepth} deep`);
  }
  const children = value.children;
  if (!Array.isArray(children) || children.length === 0) {
    throw new RuleError(at(path, "children"), "must list at least one rule");
  }
  if (children.length > RULE_LIMITS.maxChildren) {
    throw new RuleError(at(path, "children"), `must list at most ${RULE_LIMITS.maxChildren} rules`);
  }
  const parsed = children.map((c, i) => parseNode(c, at(at(path, "children"), i), depth + 1));
  if (value.kind === "atLeast") {
    const count = positive(value.count, at(path, "count"), parsed.length, true);
    return { kind: "atLeast", count, children: parsed };
  }
  return { kind: value.kind, children: parsed };
}

/**
 * A stored or submitted rule as a typed tree, or why it is not one. Strips
 * unknown fields and trims labels, so the result is what gets stored.
 */
export function parseRule(value: unknown): ParseRuleResult {
  try {
    const rule = parseNode(value, "", 0);
    const leaves = ruleLeaves(rule);
    if (leaves.length > RULE_LIMITS.maxLeaves) {
      throw new RuleError("", `has more than ${RULE_LIMITS.maxLeaves} checks`);
    }
    const itemIds = ruleChecklistItemIds(rule);
    if (new Set(itemIds).size !== itemIds.length) {
      throw new RuleError("", "checklist item ids must be unique");
    }
    return { ok: true, rule };
  } catch (error) {
    if (error instanceof RuleError) {
      return { ok: false, path: error.path, reason: error.reason };
    }
    throw error;
  }
}

/** Whether two rules are the same tree (a no-op edit logs nothing). */
export function sameRule(a: RuleNode, b: RuleNode): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
