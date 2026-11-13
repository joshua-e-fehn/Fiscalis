/**
 * Stable override lookup keys for Bitpanda holdings.
 *
 * Fiat earn wallets were historically persisted as `stock:BCPXXX`. Keep that
 * identity as an alias when they are corrected to `fiat:XXX`, so a user's
 * category/subcategory overrides survive the next replacement sync.
 */
export function getBitpandaHoldingIdentityKeys(
  assetType: string,
  symbol: string,
): string[] {
  const normalizedType = assetType.toLowerCase();
  const normalizedSymbol = symbol.toUpperCase();
  const keys = [`${normalizedType}:${normalizedSymbol}`];

  const legacyCashPlusMatch = /^BCP([A-Z]{3})$/.exec(normalizedSymbol);
  if (normalizedType === "stock" && legacyCashPlusMatch) {
    keys.push(`fiat:${legacyCashPlusMatch[1]}`);
  } else if (normalizedType === "fiat" && /^[A-Z]{3}$/.test(normalizedSymbol)) {
    keys.push(`stock:BCP${normalizedSymbol}`);
  }

  return keys;
}
