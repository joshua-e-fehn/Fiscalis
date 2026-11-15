import type { Doc } from "../_generated/dataModel";
import {
  classifyBitpandaPosition,
  classifyPlaidAccount,
  classifySnaptradePosition,
  getClassificationFields,
} from "../../../services/classification";
import {
  overrideCategoriesFor,
  parseClassificationOverride,
  type ClassificationResult,
  type ClassificationTarget,
} from "../../lib/types/classification";

/**
 * The stored fields of a user's category override and of its reset, shared
 * by classification.ts (bank accounts, broker positions) and
 * bitpanda.setUserOverride.
 */

// The automatic classification of each re-classifiable row, as the sync
// stores it (banking.saveAccounts, brokers.replaceAccountHoldings,
// actions/bitpanda.ts)

export function autoPlaidClassification(account: Doc<"plaidAccounts">) {
  return classifyPlaidAccount({
    type: account.type ?? "",
    subtype: account.subtype ?? null,
    name: account.name ?? "",
  });
}

export function autoBrokerClassification(position: Doc<"brokerPositions">) {
  return classifySnaptradePosition({
    assetType: position.assetType ?? "",
    symbol: position.symbol ?? "",
    name: position.name ?? null,
    quantity: position.quantity ?? 0,
    marketValue: position.marketValue ?? null,
  });
}

/** The automatic classification of a Bitpanda holding (actions/bitpanda.ts). */
export function autoBitpandaClassification(holding: Doc<"bitpandaHoldings">) {
  return classifyBitpandaPosition({
    assetType: holding.assetType,
    symbol: holding.symbol,
    name: holding.name ?? null,
  });
}

/** The stored fields of a user's override, checked against the taxonomy. */
export function overrideFields(
  target: ClassificationTarget,
  category: string,
  subcategory: string,
) {
  const parsed = parseClassificationOverride(
    category,
    subcategory,
    overrideCategoriesFor(target),
  );
  return {
    userCategoryOverride: parsed.category,
    userSubcategoryOverride: parsed.subcategory,
    investmentCategory: parsed.category,
    investmentSubcategory: parsed.subcategory,
    classificationSource: "user_override",
  };
}

/** The stored fields that clear an override back to `auto`. */
export function automaticFields(auto: ClassificationResult) {
  return {
    userCategoryOverride: undefined,
    userSubcategoryOverride: undefined,
    ...getClassificationFields(auto),
  };
}

/**
 * The stored fields for setting (category and subcategory given) or
 * clearing (neither given) a Bitpanda holding's override; used by
 * bitpanda.setUserOverride.
 */
export function bitpandaOverridePatch(
  holding: Doc<"bitpandaHoldings">,
  category: string | undefined,
  subcategory: string | undefined,
) {
  if (!category && !subcategory) {
    return automaticFields(autoBitpandaClassification(holding));
  }
  // A side left out keeps the holding's current value, which must then
  // still fit the other side
  return overrideFields(
    "bitpanda",
    category || holding.investmentCategory || "",
    subcategory || holding.investmentSubcategory || "",
  );
}

