import { useEffect, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDisplayCurrency } from "./displayCurrency";
import { utcDay } from "@/../services/goals/input";

/**
 * Goals (convex/goals.ts): earned purchases. The server returns money in
 * EUR; these hooks convert every money check, charge and debt to the
 * display currency once and tag the result with `currency`, so components
 * only format. A goal's own price stays in the goal's currency.
 */

/**
 * Today's UTC day (the goal and snapshot days), moving on at UTC midnight
 * so queries that take it re-run then even when no data changes.
 */
export function useUtcToday(): string {
  const [today, setToday] = useState(() => utcDay(Date.now()));
  useEffect(() => {
    const now = Date.now();
    const next = Date.parse(`${utcDay(now)}T00:00:00Z`) + 86_400_000;
    const timer = setTimeout(() => setToday(utcDay(Date.now())), next - now + 1000);
    return () => clearTimeout(timer);
  }, [today]);
  return today;
}

const isMoneyMetric = (metric: string) => metric === "invested" || metric === "gains";

/** The user's goals and trackers, money in the display currency; undefined while loading. */
export function useGoals() {
  const today = useUtcToday();
  const list = useQuery(api.goals.list, { today });
  const { fromEur, currency, isLoading } = useDisplayCurrency();
  if (list === undefined || isLoading) return { data: undefined, currency };
  if (list === null) return { data: null, currency };
  const money = <T extends { unit: string; current: number; target: number }>(leaf: T): T =>
    leaf.unit === "money"
      ? { ...leaf, current: fromEur(leaf.current), target: fromEur(leaf.target) }
      : leaf;
  const charge = <T extends { metric: string; amount: number }>(c: T): T =>
    isMoneyMetric(c.metric) ? { ...c, amount: fromEur(c.amount) } : c;
  return {
    currency,
    data: {
      ...list,
      debts: list.debts.map(charge),
      goals: list.goals.map((goal) => ({
        ...goal,
        evaluation: goal.evaluation && {
          ...goal.evaluation,
          leaves: goal.evaluation.leaves.map(money),
          charges: goal.evaluation.charges.map(charge),
          purchase: goal.evaluation.purchase && {
            ...goal.evaluation.purchase,
            charges: goal.evaluation.purchase.charges.map((c) =>
              isMoneyMetric(c.metric)
                ? {
                    ...c,
                    amount: fromEur(c.amount),
                    drawn: fromEur(c.drawn),
                    shortfall: fromEur(c.shortfall),
                  }
                : c,
            ),
          },
        },
      })),
    },
  };
}

export type GoalsData = NonNullable<ReturnType<typeof useGoals>["data"]>;
export type GoalView = GoalsData["goals"][number];
export type TrackerView = GoalsData["trackers"][number];

/** What buying a goal at `price` (its currency) would draw; money in the display currency. */
export function usePurchasePreview(goalId: Id<"goals"> | null, price: number | null) {
  const today = useUtcToday();
  const preview = useQuery(
    api.goals.purchasePreview,
    goalId && price !== null && price > 0 ? { goalId, price, today } : "skip",
  );
  const { fromEur } = useDisplayCurrency();
  if (!preview) return preview;
  return {
    ...preview,
    charges: preview.charges.map((c) =>
      isMoneyMetric(c.metric) ? { ...c, amount: fromEur(c.amount) } : c,
    ),
    leaves: preview.leaves.map((l) =>
      l.unit === "money" ? { ...l, current: fromEur(l.current), target: fromEur(l.target) } : l,
    ),
  };
}

export function useTrackerEntries(trackerId: Id<"goalTrackers"> | null) {
  return useQuery(api.goals.entries, trackerId ? { trackerId } : "skip");
}

export const useCreateGoal = () => useMutation(api.goals.create);
export const useUpdateGoal = () => useMutation(api.goals.update);
export const useBuyGoal = () => useMutation(api.goals.buy);
export const useArchiveGoal = () => useMutation(api.goals.archive);
export const useRestoreGoal = () => useMutation(api.goals.restore);
export const useRemoveGoal = () => useMutation(api.goals.remove);
export const useSetChecklistItem = () => useMutation(api.goals.setChecklistItem);
export const useCreateTracker = () => useMutation(api.goals.createTracker);
export const useRemoveTracker = () => useMutation(api.goals.removeTracker);
export const useLogEntry = () => useMutation(api.goals.logEntry);
export const useRemoveEntry = () => useMutation(api.goals.removeEntry);
