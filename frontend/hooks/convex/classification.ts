/**
 * Classification Override Hook
 *
 * React hook for managing classification overrides on Plaid accounts
 * and broker positions.
 */

import { useState, useCallback } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import type {
  InvestmentCategory,
  InvestmentSubcategory,
} from "@/lib/types/classification";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type ClassificationItemType = "plaid" | "broker";

export interface ClassificationOverrideState {
  isOpen: boolean;
  itemType: ClassificationItemType | null;
  itemId: Id<"plaidAccounts"> | Id<"brokerPositions"> | null;
  itemName: string;
}

export interface UseClassificationOverrideReturn {
  // State
  state: ClassificationOverrideState;
  // Actions
  openDialog: (
    itemType: ClassificationItemType,
    itemId: Id<"plaidAccounts"> | Id<"brokerPositions">,
    itemName: string,
  ) => void;
  closeDialog: () => void;
  // Mutations
  overridePlaidAccount: (
    accountId: Id<"plaidAccounts">,
    category: InvestmentCategory,
    subcategory: InvestmentSubcategory,
  ) => Promise<void>;
  overrideBrokerPosition: (
    positionId: Id<"brokerPositions">,
    category: InvestmentCategory,
    subcategory: InvestmentSubcategory,
  ) => Promise<void>;
  resetPlaidAccount: (accountId: Id<"plaidAccounts">) => Promise<void>;
  resetBrokerPosition: (positionId: Id<"brokerPositions">) => Promise<void>;
  // Loading states
  isOverriding: boolean;
  isResetting: boolean;
}

// ═══════════════════════════════════════════════════════════════
// HOOK
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for managing classification overrides
 *
 * @example
 * ```tsx
 * const { state, openDialog, closeDialog } = useClassificationOverride();
 *
 * // Open dialog for a Plaid account
 * openDialog("plaid", account._id, account.name);
 *
 * // Render dialog
 * <ClassificationOverrideDialog
 *   open={state.isOpen}
 *   onOpenChange={(open) => !open && closeDialog()}
 *   itemType={state.itemType!}
 *   itemId={state.itemId!}
 *   itemName={state.itemName}
 * />
 * ```
 */
export function useClassificationOverride(): UseClassificationOverrideReturn {
  const [state, setState] = useState<ClassificationOverrideState>({
    isOpen: false,
    itemType: null,
    itemId: null,
    itemName: "",
  });

  const [isOverriding, setIsOverriding] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Mutations
  const overridePlaidMutation = useMutation(
    api.classification.overridePlaidAccountClassification,
  );
  const overrideBrokerMutation = useMutation(
    api.classification.overrideBrokerPositionClassification,
  );
  const resetPlaidMutation = useMutation(
    api.classification.resetPlaidAccountClassification,
  );
  const resetBrokerMutation = useMutation(
    api.classification.resetBrokerPositionClassification,
  );

  // Actions
  const openDialog = useCallback(
    (
      itemType: ClassificationItemType,
      itemId: Id<"plaidAccounts"> | Id<"brokerPositions">,
      itemName: string,
    ) => {
      setState({
        isOpen: true,
        itemType,
        itemId,
        itemName,
      });
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setState({
      isOpen: false,
      itemType: null,
      itemId: null,
      itemName: "",
    });
  }, []);

  // Override functions
  const overridePlaidAccount = useCallback(
    async (
      accountId: Id<"plaidAccounts">,
      category: InvestmentCategory,
      subcategory: InvestmentSubcategory,
    ) => {
      setIsOverriding(true);
      try {
        await overridePlaidMutation({
          accountId,
          category,
          subcategory,
        });
      } finally {
        setIsOverriding(false);
      }
    },
    [overridePlaidMutation],
  );

  const overrideBrokerPosition = useCallback(
    async (
      positionId: Id<"brokerPositions">,
      category: InvestmentCategory,
      subcategory: InvestmentSubcategory,
    ) => {
      setIsOverriding(true);
      try {
        await overrideBrokerMutation({
          positionId,
          category,
          subcategory,
        });
      } finally {
        setIsOverriding(false);
      }
    },
    [overrideBrokerMutation],
  );

  const resetPlaidAccount = useCallback(
    async (accountId: Id<"plaidAccounts">) => {
      setIsResetting(true);
      try {
        await resetPlaidMutation({ accountId });
      } finally {
        setIsResetting(false);
      }
    },
    [resetPlaidMutation],
  );

  const resetBrokerPosition = useCallback(
    async (positionId: Id<"brokerPositions">) => {
      setIsResetting(true);
      try {
        await resetBrokerMutation({ positionId });
      } finally {
        setIsResetting(false);
      }
    },
    [resetBrokerMutation],
  );

  return {
    state,
    openDialog,
    closeDialog,
    overridePlaidAccount,
    overrideBrokerPosition,
    resetPlaidAccount,
    resetBrokerPosition,
    isOverriding,
    isResetting,
  };
}

/**
 * Hook to get items with user overrides
 */
export function useOverriddenItems() {
  return useQuery(api.classification.getOverriddenItems);
}

/**
 * Hook to get Plaid account classification details
 */
export function usePlaidAccountClassification(
  accountId: Id<"plaidAccounts"> | undefined,
) {
  return useQuery(
    api.classification.getPlaidAccountClassification,
    accountId ? { accountId } : "skip",
  );
}

/**
 * Hook to get broker position classification details
 */
export function useBrokerPositionClassification(
  positionId: Id<"brokerPositions"> | undefined,
) {
  return useQuery(
    api.classification.getBrokerPositionClassification,
    positionId ? { positionId } : "skip",
  );
}
