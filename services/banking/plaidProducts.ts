/**
 * Plaid products requested when a bank is linked (ENG-225).
 *
 * `auth` (account and routing numbers) and `identity` (owner names,
 * addresses, phone numbers) are never requested: the app does not use that
 * data, and holding it would only widen what a breach could expose. They are
 * dropped even when the `PLAID_PRODUCTS` environment variable still lists
 * them, so an old deployment setting cannot bring them back.
 */
export const FORBIDDEN_PLAID_PRODUCTS: ReadonlySet<string> = new Set([
  "auth",
  "identity",
]);

const DEFAULT_PLAID_PRODUCTS = ["transactions"];

/** Parse `PLAID_PRODUCTS` (comma-separated) into the products to request. */
export function plaidLinkProducts(envValue: string | undefined): string[] {
  const listed = (envValue ?? "")
    .split(",")
    .map((product) => product.trim().toLowerCase())
    .filter(Boolean);
  const allowed = [...new Set(listed)].filter(
    (product) => !FORBIDDEN_PLAID_PRODUCTS.has(product),
  );
  return allowed.length > 0 ? allowed : [...DEFAULT_PLAID_PRODUCTS];
}

/** The languages Plaid Link is offered in (Plaid's `language` parameter). */
const PLAID_LINK_LANGUAGES: ReadonlySet<string> = new Set([
  "da", "de", "en", "es", "et", "fr", "it", "lt", "lv", "nl", "no", "pl",
  "pt", "ro", "sv",
]);

/**
 * The Plaid Link language for an app language code. Plaid takes primary
 * subtags only ("pt", not "pt-PT"); a language Plaid does not offer opens
 * Link in English.
 */
export function plaidLinkLanguage(language: string | undefined): string {
  const primary = (language ?? "").split("-")[0].toLowerCase();
  return PLAID_LINK_LANGUAGES.has(primary) ? primary : "en";
}
