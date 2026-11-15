/**
 * The codes of the errors a user can cause or fix: Convex functions throw
 * them as ConvexError({ code, params }) (frontend/convex/lib/userError.ts),
 * and the app shows common.errors.<code> in the user's language
 * (frontend/i18n/errors.ts useErrorMessage). Connection rows persist a code
 * as their errorMessage, rendered the same way (useStoredErrorMessage).
 *
 * A dotted code is a nested message (birthDate.format →
 * common.errors.birthDate.format). Auth and internal errors are plain
 * English Errors and have no code. services/i18n/i18n.test.ts checks that
 * every code has a message in every language.
 *
 * Framework-free: imported by Convex functions, the app and vitest.
 */
export const USER_ERROR_CODES = [
  // API keys (services/apiKeys/apiKeyService.ts ApiKeyNameError)
  "apiKeyNameRequired",
  "apiKeyNameTooLong",
  "apiKeyNotFound",
  "apiKeyLimit",

  // Plans and billing (convex/lib/plan.ts, convex/billing.ts)
  "planConnectionLimit",
  "planApiKeysRequirePro",
  "planPiesRequirePro",
  "planTeamsRequirePro",
  "billingUnavailable",
  "billingAlreadySubscribed",
  "billingNoCustomer",
  "billingProviderError",

  // Account deletion (convex/account.ts)
  "accountDeleteConfirmationMismatch",
  "accountDeleteRevokeFailed",

  // Ownership: a missing and a foreign document read the same
  "accountNotFound",
  "connectionNotFound",
  "loanNotFound",
  "loanPaymentNotFound",
  "loanScenarioNotFound",

  // Vault (convex/vault.ts, services/finance/metalsLedger.ts LedgerError)
  "catalogItemNotFound",
  "vaultItemNotFound",
  "vaultEntryNotFound",
  "vaultWeightAndPurityRequired",
  "vaultNoOpeningBalance",
  "vaultNothingToSell",
  "vaultDeleteLeavesNegativeHolding",
  "vaultDeleteLeavesNegativeHoldingUndated",
  "vaultInvalidDate",
  "vaultQuantityNotPositive",
  "vaultPriceNegative",
  "vaultDateRequired",
  "vaultDateInFuture",
  "vaultOpeningAndTotalBoth",
  "vaultSellsMoreThanHeld",

  // Manual assets (convex/manualAssets.ts, services/portfolio/manualAssets.ts)
  "manualAssetNotFound",
  "manualAssetSubcategoryInvalid",
  "manualAssetNameRequired",
  "manualAssetNameTooLong",
  "manualAssetCurrencyInvalid",
  "manualAssetValuationRequired",
  "manualAssetTooManyValuations",
  "manualAssetInvalidDate",
  "manualAssetDateInFuture",
  "manualAssetValueInvalid",
  "manualAssetCostInvalid",
  "manualAssetAttributeInvalid",

  // Valuation overrides (convex/valuationOverrides.ts, services/pricing/valuationOverride.ts)
  "holdingNotFound",
  "valuationNotSupported",
  "valuationPriceInvalid",
  "valuationCurrencyInvalid",
  "valuationInvalidDate",
  "valuationDateInFuture",
  "valuationRateInvalid",
  // Pies (convex/pies.ts, services/portfolio/pies.ts)
  "pieNotFound",
  "pieNameRequired",
  "pieNameTooLong",
  "pieDescriptionTooLong",
  "pieLabelTooLong",
  "pieSlicesRequired",
  "pieTooManySlices",
  "pieWeightInvalid",
  "pieWeightsNotHundred",
  "pieSliceTargetInvalid",
  "pieSliceDuplicate",
  "pieHoldingNotFound",

  // Goals (convex/goals.ts, services/goals/input.ts)
  "goalNotFound",
  "goalNameRequired",
  "goalNameTooLong",
  "goalCurrencyInvalid",
  "goalPriceInvalid",
  "goalRuleInvalid",
  "goalNotActive",
  "goalBoughtCannotDelete",
  "goalTrackerNotFound",
  "goalTrackerNameRequired",
  "goalTrackerNameTooLong",
  "goalTrackerInUse",
  "goalEntryNotFound",
  "goalEntryValueInvalid",
  "goalEntryDateInvalid",
  "goalChecklistItemNotFound",
  "goalStartDateInvalid",
  "goalBackdateClosed",

  // Teams (convex/teams.ts, services/teams/teams.ts)
  "teamNotFound",
  "teamNameRequired",
  "teamNameTooLong",
  "teamPermissionDenied",
  "teamMemberNotFound",
  "teamInviteInvalid",
  "teamAlreadyMember",
  "teamOwnedLimit",
  "teamMemberLimit",
  "teamInviteLimit",
  "teamOwnerCannotLeave",

  // Profile and onboarding (frontend/lib/utils/date.ts BirthDateError)
  "birthDate.format",
  "birthDate.invalid",
  "birthDate.future",
  "birthDate.outOfRange",
  "onboardingProfileIncomplete",

  // Retirement plan: the wizard shows each rule's message itself
  // (retirement.validation), so the server's check needs only one code
  "retirementPlanInvalid",
  "exchangeRateUnavailable",

  // Bitpanda (convex/actions/bitpanda.ts, services/security/connectionStatus.ts)
  "bitpandaKeyRequired",
  "bitpandaKeyRejected",
  "bitpandaUnavailable",
  "bitpandaReauthRequired",
  "bitpandaTemporarilyUnavailable",
  "bitpandaSyncFailed",

  // Plaid (convex/actions/plaid.ts)
  "plaidDisconnectFailed",

  // SnapTrade (convex/lib/snaptrade.ts parseSnapTradeError, convex/actions/snaptrade.ts)
  "snaptradeNotRegistered",
  "snaptradeRegistrationConflict",
  "snaptradeSessionExpired",
  "snaptradeConnectionExpired",
  "snaptradeConnectionNotFound",
  "snaptradeRateLimited",
  "snaptradeUnavailable",
  "snaptradeTimeout",
  "snaptradeNetworkError",
  "snaptradeBrokerageError",
  "snaptradeUnknown",
  "snaptradeAccountUnavailable",
  "snaptradeAccountsUnplaced",
  "snaptradeSyncFailed",
] as const;

export type UserErrorCode = (typeof USER_ERROR_CODES)[number];

/** Message parameters: ICU arguments of common.errors.<code>. */
export type UserErrorParams = Record<string, string | number>;

/** The data of a coded ConvexError. */
export interface UserErrorData {
  code: UserErrorCode;
  params?: UserErrorParams;
}

const CODES: ReadonlySet<string> = new Set(USER_ERROR_CODES);

/** Whether `value` is one of {@link USER_ERROR_CODES}. */
export function isUserErrorCode(value: unknown): value is UserErrorCode {
  return typeof value === "string" && CODES.has(value);
}
