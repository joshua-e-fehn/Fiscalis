import { describe, expect, it } from "vitest";
import { plaidLinkProducts } from "./plaidProducts";

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
