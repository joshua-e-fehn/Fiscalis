/**
 * Classification override hooks
 *
 * Change, or reset to automatic, the category of a bank account, broker
 * position or Bitpanda holding, each through its provider's mutation.
 */

import { useCallback, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type {
  ClassificationTarget,
  InvestmentCategory,
  InvestmentSubcategory,
} from "@/lib/types/classification";

/** A row whose category the user can change. */
export interface CategoryOverrideItem {
  target: ClassificationTarget;
  /** The stored document's id in the target's table */
  id: string;
}

export interface UseCategoryOverrideReturn {
  /** Files the item under the category and subcategory, as a manual one */
  save: (
    item: CategoryOverrideItem,
    category: InvestmentCategory,
    subcategory: InvestmentSubcategory,
  ) => Promise<void>;
  /** Clears the manual category: the rule engine's applies again */
  reset: (item: CategoryOverrideItem) => Promise<void>;
  isPending: boolean;
}

/**
 * Save or reset a manual category. The ids come from the server
 * (portfolio.getUnifiedPositions `_id`, banking.getAccounts,
 * classification.getOverriddenItems), so the casts only restore their table
 * type; the mutations check that the row belongs to the user.
 */
export function useCategoryOverride(): UseCategoryOverrideReturn {
  const [isPending, setIsPending] = useState(false);

  const overridePlaid = useMutation(
    api.classification.overridePlaidAccountClassification,
  );
  const overrideBroker = useMutation(
    api.classification.overrideBrokerPositionClassification,
  );
  const resetPlaid = useMutation(
    api.classification.resetPlaidAccountClassification,
  );
  const resetBroker = useMutation(
    api.classification.resetBrokerPositionClassification,
  );
  const setBitpanda = useMutation(api.bitpanda.setUserOverride);

  const run = useCallback(async (call: () => Promise<unknown>) => {
    setIsPending(true);
    try {
      await call();
    } finally {
      setIsPending(false);
    }
  }, []);

  const save = useCallback(
    (
      item: CategoryOverrideItem,
      category: InvestmentCategory,
      subcategory: InvestmentSubcategory,
    ) =>
      run(() => {
        switch (item.target) {
          case "plaid":
            return overridePlaid({
              accountId: item.id as Id<"plaidAccounts">,
              category,
              subcategory,
            });
          case "broker":
            return overrideBroker({
              positionId: item.id as Id<"brokerPositions">,
              category,
              subcategory,
            });
          case "bitpanda":
            return setBitpanda({
              holdingId: item.id as Id<"bitpandaHoldings">,
              category,
              subcategory,
            });
        }
      }),
    [run, overridePlaid, overrideBroker, setBitpanda],
  );

  const reset = useCallback(
    (item: CategoryOverrideItem) =>
      run(() => {
        switch (item.target) {
          case "plaid":
            return resetPlaid({ accountId: item.id as Id<"plaidAccounts"> });
          case "broker":
            return resetBroker({
              positionId: item.id as Id<"brokerPositions">,
            });
          case "bitpanda":
            return setBitpanda({
              holdingId: item.id as Id<"bitpandaHoldings">,
            });
        }
      }),
    [run, resetPlaid, resetBroker, setBitpanda],
  );

  return { save, reset, isPending };
}

/** Every item with a manual category, with its automatic one. */
export function useOverriddenItems() {
  return useQuery(api.classification.getOverriddenItems);
}
