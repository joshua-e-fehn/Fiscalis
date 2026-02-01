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
  useBalancesSummary,
  useRefreshAccounts,
  useTransactions,
  useTransactionsByDate,
  useSyncTransactions,
  useAuth,
  useIdentity,
} from "./banking";

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
  usePortfolioSummary,
  // Transaction queries
  useBrokerTransactions,
  // Sync hooks
  useSyncPositions,
  useSyncAll,
  // Broker discovery hooks
  useListBrokers,
  useSearchBrokers,
  // Legacy hooks (deprecated, will be removed in Phase 6)
  useCreateBrokerConnection,
  useDeleteBrokerConnection,
  useUpdateConnectionStatus,
  useRenameBrokerConnection,
  useBrokerPositionsByConnection,
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
  useSyncWorldBankIndicators,
  useRecordIndicatorTimeout,
  useRecordIndicatorSuccess,
  useIndicatorByCode,
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

// Re-export liabilities summary hook
export { useLiabilitiesSummary } from "./liabilities";

// Re-export classification override hooks
export {
  useClassificationOverride,
  useOverriddenItems,
  usePlaidAccountClassification,
  useBrokerPositionClassification,
  type ClassificationItemType,
  type ClassificationOverrideState,
  type UseClassificationOverrideReturn,
} from "./classification";
