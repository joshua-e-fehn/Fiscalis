// Re-export all Convex banking hooks
export {
  useCreateLinkToken,
  useCreateUpdateLinkToken,
  useExchangeToken,
  usePlaidItems,
  useItemsNeedingReauth,
  useDeletePlaidItem,
  usePlaidAccounts,
  usePlaidAccountsByItem,
  useRefreshAccounts,
  useUpdateInstitutionLogo,
  useUpdateAllInstitutionLogos,
  useTransactions,
  TRANSACTIONS_PAGE_SIZE,
  useSyncTransactions,
} from "./banking";

// Re-export all Convex Bitpanda hooks
export {
  useBitpandaConnections,
  useBitpandaConnectionsNeedingAttention,
  useBitpandaHoldings,
  useBitpandaHoldingsByCategory,
  useBitpandaTransactions,
  useConnectBitpanda,
  useSyncBitpandaConnection,
  useSyncAllBitpandaConnections,
  useDeleteBitpandaConnection,
} from "./bitpanda";

// Re-export all Convex broker hooks
export {
  // SnapTrade user hooks
  useSnaptradeUser,
  useRegisterSnaptrade,
  useDeleteSnaptradeUser,
  // SnapTrade connection hooks
  useCreateConnectUrl,
  useHandleCallback,
  useDeleteConnection,
  useSnaptradeConnect,
  // Connection queries
  useBrokerConnections,
  useBrokerConnection,
  useConnectionsNeedingAttention,
  // Account queries
  useBrokerAccounts,
  // Position queries
  useBrokerPositions,
  useBrokerPositionsBySymbol,
  // Transaction queries
  useBrokerTransactions,
  // Sync hooks
  useSyncPositions,
  useSyncAll,
  useUpdateAllBrokerLogos,
  // Broker discovery hooks
  useListBrokers,
  useSearchBrokers,
} from "./brokers";

// Re-export all Convex loans hooks
export {
  // Query hooks
  useLoans,
  useActiveLoans,
  useLoan,
  useLoanWithPayments,
  useLoanPayments,
  useUpcomingPayments,
  useLoanScenarios,
  useLoansSummary,
  // Mutation hooks
  useCreateLoan,
  useUpdateLoan,
  useDeleteLoan,
  useRecordPayment,
  useUpdatePayment,
  useDeletePayment,
  useSaveScenario,
  useUpdateScenario,
  useDeleteScenario,
} from "./loans";

// Re-export all Convex metals hooks
export {
  // Query hooks
  useMetals,
  useMetalsSummary,
  useMetalItem,
  // Mutation hooks
  useAddMetalItemFromCatalog,
  useAddCustomMetalItem,
  useUpdateMetalItem,
  useDeleteMetalItem,
  useAddMetalTransaction,
  useDeleteMetalTransaction,
} from "./metals";

// Re-export all Convex World Bank indicator hooks
export {
  useConvexIndicatorSearch,
  useWorldBankSyncStatus,
  useRequestIndicatorCheck,
  useUserFavorites,
  useIsIndicatorFavorited,
  useToggleFavorite,
} from "./worldbank";

// Re-export portfolio overview hook
export {
  usePortfolioOverview,
  type AssetCategoryData,
  type LiabilitiesSummaryData,
  type PortfolioSummary,
} from "./portfolio";

// Re-export display currency hooks
export {
  useDisplayCurrency,
  useDisplayRateHistory,
  type DisplayCurrencyState,
  type DisplayRateHistory,
  type DisplayRateSource,
} from "./displayCurrency";

// Re-export liabilities summary hook
export { useLiabilitiesSummary } from "./liabilities";

// Re-export classification override hooks
export {
  useCategoryOverride,
  useOverriddenItems,
  type CategoryOverrideItem,
  type UseCategoryOverrideReturn,
} from "./classification";

// Re-export retirement planner hooks
export {
  useRetirementPlan,
  useSaveRetirementPlan,
  useResetRetirementPlan,
  useRetirementResults,
  useRetirementPreview,
} from "./retirement";

// Re-export public API key hooks
export {
  useApiKeys,
  useCreateApiKey,
  useRevokeApiKey,
  netWorthEndpointUrl,
} from "./apiKeys";

// Re-export billing hooks (plans, Stripe Checkout and portal)
export {
  useMyPlan,
  useBillingOverview,
  usePlanUsage,
  useCreateCheckoutSession,
  useCreatePortalSession,
} from "./billing";

// Re-export notification centre hooks (ENG-207)
export {
  useNotificationBell,
  useNotificationList,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  useNotificationPreferences,
  useSetNotificationPreference,
} from "./notifications";

// Re-export team hooks (Settings > Team, workspace switcher)
export {
  useMyTeams,
  useTeam,
  useInvitePreview,
  useCreateTeam,
  useRenameTeam,
  useDeleteTeam,
  useSetTeamSharing,
  useLeaveTeam,
  useRemoveTeamMember,
  useChangeTeamRole,
  useCreateTeamInvite,
  useRevokeTeamInvite,
  useAcceptTeamInvite,
} from "./teams";
