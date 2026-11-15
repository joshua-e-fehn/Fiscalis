/**
 * Pies: target-allocation strategies (Investment Strategies > Pies). A pie
 * is a named set of slices, each with a target weight (the weights sum to
 * 100%) and a target: a whole category, one subcategory of it, or specific
 * holdings. frontend/convex/pies.ts stores them; this module holds the
 * input rules and the drift math.
 *
 * Actual weights come from the one net-worth aggregator's holdings
 * (aggregate.ts placeHolding), so a pie sees the same values, categories
 * and overrides as net worth. Each asset holding counts towards at most one
 * slice, the most specific that matches it: a slice naming the holding,
 * then a subcategory slice, then a category slice. Holdings no slice matches
 * are outside the pie and do not count towards its total.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */

import type { UserErrorCode } from "../i18n/userErrorCodes";
import {
  ASSET_CATEGORIES,
  placeHolding,
  type NormalizedHolding,
} from "./aggregate";

// ═══════════════════════════════════════════════════════════════
// Input
// ═══════════════════════════════════════════════════════════════

/** The categories a slice can target: every asset category. */
export const PIE_CATEGORIES = ASSET_CATEGORIES;

export type PieCategory = (typeof PIE_CATEGORIES)[number];

export type PieSliceTarget =
  | { kind: "category"; category: string; subcategory?: string }
  | { kind: "holdings"; holdingKeys: string[] };

export interface PieSlice {
  /** Shown instead of the target's name; optional */
  label?: string;
  /** Target weight in percent (0–100, two decimals) */
  weight: number;
  target: PieSliceTarget;
}

export interface PieInput {
  name: string;
  description?: string;
  slices: PieSlice[];
}

export const PIE_NAME_MAX = 80;
export const PIE_DESCRIPTION_MAX = 280;
export const PIE_LABEL_MAX = 60;
export const PIE_MAX_SLICES = 30;
export const PIE_MAX_HOLDINGS_PER_SLICE = 50;
/** How far the weights may sum from 100 (rounding of two-decimal weights). */
export const PIE_WEIGHT_TOLERANCE = 0.005;

export function isPieCategory(value: string): value is PieCategory {
  return (PIE_CATEGORIES as readonly string[]).includes(value);
}

/** A weight rounded to the two decimals stored. */
export function roundWeight(weight: number): number {
  return Math.round(weight * 100) / 100;
}

/** Sum of the slices' weights, to two decimals. */
export function totalWeight(slices: readonly Pick<PieSlice, "weight">[]): number {
  return roundWeight(slices.reduce((sum, s) => sum + s.weight, 0));
}

/**
 * The first rule the input breaks, as a user error code, or null when it
 * is a valid pie.
 */
export function validatePie(input: PieInput): UserErrorCode | null {
  const name = input.name.trim();
  if (!name) return "pieNameRequired";
  if (name.length > PIE_NAME_MAX) return "pieNameTooLong";
  if ((input.description?.trim().length ?? 0) > PIE_DESCRIPTION_MAX) {
    return "pieDescriptionTooLong";
  }
  if (input.slices.length === 0) return "pieSlicesRequired";
  if (input.slices.length > PIE_MAX_SLICES) return "pieTooManySlices";

  const targets = new Set<string>();
  const holdingKeys = new Set<string>();
  for (const slice of input.slices) {
    if ((slice.label?.trim().length ?? 0) > PIE_LABEL_MAX) return "pieLabelTooLong";
    if (!Number.isFinite(slice.weight) || slice.weight <= 0 || slice.weight > 100) {
      return "pieWeightInvalid";
    }
    const { target } = slice;
    if (target.kind === "category") {
      if (!isPieCategory(target.category)) return "pieSliceTargetInvalid";
      if (target.subcategory !== undefined && !target.subcategory.trim()) {
        return "pieSliceTargetInvalid";
      }
      const identity = `${target.category}:${target.subcategory ?? ""}`;
      if (targets.has(identity)) return "pieSliceDuplicate";
      targets.add(identity);
    } else {
      const keys = target.holdingKeys.map((k) => k.trim()).filter(Boolean);
      if (keys.length === 0) return "pieSliceTargetInvalid";
      if (keys.length > PIE_MAX_HOLDINGS_PER_SLICE) return "pieSliceTargetInvalid";
      for (const key of new Set(keys)) {
        if (holdingKeys.has(key)) return "pieSliceDuplicate";
        holdingKeys.add(key);
      }
    }
  }
  if (Math.abs(totalWeight(input.slices) - 100) > PIE_WEIGHT_TOLERANCE) {
    return "pieWeightsNotHundred";
  }
  return null;
}

/**
 * The input as stored: trimmed text (blank optional text left out),
 * two-decimal weights and each slice's holding keys once.
 */
export function normalizePie(input: PieInput): PieInput {
  const description = input.description?.trim();
  return {
    name: input.name.trim(),
    ...(description ? { description } : {}),
    slices: input.slices.map((slice) => {
      const label = slice.label?.trim();
      const target: PieSliceTarget =
        slice.target.kind === "category"
          ? {
              kind: "category",
              category: slice.target.category,
              ...(slice.target.subcategory
                ? { subcategory: slice.target.subcategory.trim() }
                : {}),
            }
          : {
              kind: "holdings",
              holdingKeys: [
                ...new Set(slice.target.holdingKeys.map((k) => k.trim()).filter(Boolean)),
              ],
            };
      return { ...(label ? { label } : {}), weight: roundWeight(slice.weight), target };
    }),
  };
}

/** Every holding key the slices name. */
export function pieHoldingKeys(slices: readonly PieSlice[]): string[] {
  return slices.flatMap((s) => (s.target.kind === "holdings" ? s.target.holdingKeys : []));
}

/**
 * Weights that split 100% evenly over `count` slices, in two decimals: the
 * remainder of the rounding goes to the first slices (3 → 33.34, 33.33, 33.33).
 */
export function evenWeights(count: number): number[] {
  if (count <= 0) return [];
  const cents = 10_000;
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) / 100);
}

// ═══════════════════════════════════════════════════════════════
// Holdings
// ═══════════════════════════════════════════════════════════════

/** An asset holding as a pie sees it. */
export interface PieHolding {
  /** Stable across provider syncs (NormalizedHolding.key, else its id) */
  key: string;
  name: string;
  category: string;
  subcategory: string;
  /** Base-currency value (EUR), positive */
  value: number;
}

/**
 * The asset holdings a pie can hold, at their placed category and value
 * (a credit balance is cash): liabilities and empty holdings are left out.
 */
export function pieHoldingsFrom(holdings: readonly NormalizedHolding[]): PieHolding[] {
  const out: PieHolding[] = [];
  for (const h of holdings) {
    const at = placeHolding(h);
    if (at.category === "liabilities" || !(at.value > 0)) continue;
    out.push({
      key: h.key ?? h.id,
      name: h.name,
      category: at.category,
      subcategory: at.subcategory,
      value: at.value,
    });
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// Drift
// ═══════════════════════════════════════════════════════════════

/** Drift (percentage points) beyond which a slice needs rebalancing. */
export const PIE_DRIFT_THRESHOLD = 5;

export type DriftStatus = "onTarget" | "over" | "under";

export interface SliceDrift {
  /** Target weight in percent */
  targetWeight: number;
  /** Base-currency value of the holdings counted towards the slice */
  actualValue: number;
  /** Share of the pie's total in percent; null when the pie holds nothing */
  actualWeight: number | null;
  /** actualWeight − targetWeight in percentage points; null when empty */
  drift: number | null;
  /**
   * Base-currency amount to buy (positive) or sell (negative) to bring the
   * slice to its target at the pie's current total
   */
  rebalance: number;
  status: DriftStatus | null;
  /** The holdings counted towards the slice, largest first */
  holdings: PieHolding[];
  /** Holding keys the slice names that the user no longer holds */
  missingHoldingKeys: string[];
}

export interface PieDrift {
  /** Base-currency value of every holding counted towards a slice */
  totalValue: number;
  slices: SliceDrift[];
  /** Largest absolute drift of a slice; null when the pie holds nothing */
  maxDrift: number | null;
}

/** The status of a drift: within ±threshold is on target. */
export function driftStatus(
  drift: number,
  threshold: number = PIE_DRIFT_THRESHOLD,
): DriftStatus {
  if (Math.abs(drift) < threshold) return "onTarget";
  return drift > 0 ? "over" : "under";
}

/** How specifically a slice matches a holding; 0 when it does not. */
function matchRank(target: PieSliceTarget, h: PieHolding): number {
  if (target.kind === "holdings") return target.holdingKeys.includes(h.key) ? 3 : 0;
  if (target.category !== h.category) return 0;
  if (target.subcategory === undefined) return 1;
  return target.subcategory === h.subcategory ? 2 : 0;
}

/**
 * Target vs actual weight and drift per slice. Each holding counts towards
 * the most specific matching slice only (holding > subcategory > category).
 */
export function computePieDrift(
  slices: readonly PieSlice[],
  holdings: readonly PieHolding[],
  threshold: number = PIE_DRIFT_THRESHOLD,
): PieDrift {
  const assigned: PieHolding[][] = slices.map(() => []);
  for (const h of holdings) {
    let best = -1;
    let bestRank = 0;
    slices.forEach((slice, i) => {
      const rank = matchRank(slice.target, h);
      if (rank > bestRank) {
        best = i;
        bestRank = rank;
      }
    });
    if (best >= 0) assigned[best].push(h);
  }

  const values = assigned.map((list) => list.reduce((sum, h) => sum + h.value, 0));
  const totalValue = values.reduce((sum, v) => sum + v, 0);
  const held = new Set(holdings.map((h) => h.key));

  const sliceDrifts = slices.map((slice, i): SliceDrift => {
    const actualValue = values[i];
    const actualWeight = totalValue > 0 ? (actualValue / totalValue) * 100 : null;
    const drift = actualWeight === null ? null : actualWeight - slice.weight;
    return {
      targetWeight: slice.weight,
      actualValue,
      actualWeight,
      drift,
      rebalance: (slice.weight / 100) * totalValue - actualValue,
      status: drift === null ? null : driftStatus(drift, threshold),
      holdings: [...assigned[i]].sort((a, b) => b.value - a.value),
      missingHoldingKeys:
        slice.target.kind === "holdings"
          ? slice.target.holdingKeys.filter((k) => !held.has(k))
          : [],
    };
  });

  const drifts = sliceDrifts
    .map((s) => s.drift)
    .filter((d): d is number => d !== null)
    .map(Math.abs);
  return {
    totalValue,
    slices: sliceDrifts,
    maxDrift: drifts.length > 0 ? Math.max(...drifts) : null,
  };
}
