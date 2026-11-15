import { describe, expect, it } from "vitest";
import { plaidLinkLanguage, plaidLinkProducts } from "./plaidProducts";

describe("plaidLinkProducts", () => {
  it("defaults to transactions only", () => {
    expect(plaidLinkProducts(undefined)).toEqual(["transactions"]);
    expect(plaidLinkProducts("")).toEqual(["transactions"]);
  });

  it("drops auth and identity even when configured", () => {
    expect(
      plaidLinkProducts("auth,transactions,identity,investments"),
    ).toEqual(["transactions", "investments"]);
  });

  it("normalises case, whitespace and duplicates", () => {
    expect(plaidLinkProducts(" Transactions , transactions,INVESTMENTS ")).toEqual(
      ["transactions", "investments"],
    );
  });

  it("falls back to the default when only forbidden products are listed", () => {
    expect(plaidLinkProducts("auth, identity")).toEqual(["transactions"]);
  });
});

describe("plaidLinkLanguage", () => {
  it("passes Plaid's primary subtag for supported languages", () => {
    expect(plaidLinkLanguage("de")).toBe("de");
    expect(plaidLinkLanguage("pt-PT")).toBe("pt");
    expect(plaidLinkLanguage("es")).toBe("es");
  });

  it("falls back to English for languages Plaid does not offer", () => {
    expect(plaidLinkLanguage(undefined)).toBe("en");
    expect(plaidLinkLanguage("zh-Hans")).toBe("en");
    expect(plaidLinkLanguage("ar")).toBe("en");
  });
});
