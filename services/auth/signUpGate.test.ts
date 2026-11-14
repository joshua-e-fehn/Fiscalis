import { describe, expect, it } from "vitest";
import { allowSignUpForm } from "./signUpGate";

describe("allowSignUpForm", () => {
  it("sends a bare /sign-up to the waitlist", () => {
    expect(allowSignUpForm(undefined, {})).toBe(false);
    expect(allowSignUpForm([], { redirect_url: "/dashboard" })).toBe(false);
  });

  it("lets an invitation link through", () => {
    expect(allowSignUpForm(undefined, { __clerk_ticket: "tkt_123" })).toBe(
      true,
    );
    expect(allowSignUpForm(undefined, { __clerk_ticket: ["tkt_1"] })).toBe(
      true,
    );
  });

  it("ignores an empty ticket", () => {
    expect(allowSignUpForm(undefined, { __clerk_ticket: "" })).toBe(false);
    expect(allowSignUpForm(undefined, { __clerk_ticket: [] })).toBe(false);
  });

  it("keeps the later steps of a started sign-up reachable", () => {
    expect(allowSignUpForm(["verify-email-address"], {})).toBe(true);
    expect(allowSignUpForm(["continue"], {})).toBe(true);
  });
});
