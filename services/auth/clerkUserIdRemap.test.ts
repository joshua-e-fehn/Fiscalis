import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { USER_DATA_TABLE_NAMES } from "../privacy/userData";
import {
  KEPT_CLERK_ID_FIELDS,
  describeCounts,
  isClerkUserId,
  remapArgsRefusal,
} from "./clerkUserIdRemap";

const SCHEMA = readFileSync(
  path.resolve(__dirname, "../../frontend/convex/schema.ts"),
  "utf8",
);

/** Each table's source text in schema.ts: name -> its defineTable(...) chain. */
function schemaTables(): Map<string, string> {
  const starts = [...SCHEMA.matchAll(/^\t(\w+): defineTable\(/gm)];
  const tables = new Map<string, string>();
  starts.forEach((match, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].index : SCHEMA.length;
    tables.set(match[1], SCHEMA.slice(match.index, end));
  });
  return tables;
}

/** Top-level field names that suggest a stored identity (Clerk ID, token, issuer). */
const IDENTITY_FIELD =
  /^\t\t(\w*(?:userId|UserId|owner|Owner|createdBy|CreatedBy|subject|Subject|tokenIdentifier|TokenIdentifier|issuer|Issuer|clerk|Clerk)\w*): v\./gm;

/** Every identity-like `table.field` in the schema. */
function identityFields(): string[] {
  const found: string[] = [];
  for (const [table, source] of schemaTables()) {
    for (const match of source.matchAll(IDENTITY_FIELD)) {
      // Classification overrides are category names, not identities
      if (/^user(Sub)?[Cc]ategoryOverride$/.test(match[1])) continue;
      found.push(`${table}.${match[1]}`);
    }
  }
  return found;
}

describe("Clerk ID fields", () => {
  it("parses the schema", () => {
    // Guards the parser: a format change must not let the check below
    // pass vacuously
    expect(schemaTables().size).toBeGreaterThan(20);
    expect(identityFields()).toContain("plaidItems.userId");
  });

  it("remaps or deliberately keeps every identity-like field", () => {
    const accounted = new Set([
      ...USER_DATA_TABLE_NAMES.map((table) => `${table}.userId`),
      ...KEPT_CLERK_ID_FIELDS.map((f) => `${f.table}.${f.field}`),
    ]);
    expect(identityFields().filter((f) => !accounted.has(f))).toEqual([]);
  });

  it("keeps only fields that exist", () => {
    const found = identityFields();
    for (const { table, field } of KEPT_CLERK_ID_FIELDS) {
      expect(found).toContain(`${table}.${field}`);
    }
  });
});

describe("remapArgsRefusal", () => {
  const from = "user_2abcDEFghiJKLmnoPQRstu";
  const to = "user_3zyxWVUtsrQPOnmlKJIhgf";

  it("accepts two different Clerk IDs", () => {
    expect(remapArgsRefusal(from, to)).toBeNull();
  });

  it("refuses the same ID", () => {
    expect(remapArgsRefusal(from, from)).toMatch(/same/);
  });

  it("refuses a target that is not a Clerk user ID", () => {
    expect(remapArgsRefusal(from, "")).toMatch(/Clerk user ID/);
    expect(remapArgsRefusal(from, "org_2abcDEFghiJKLmno")).toMatch(/Clerk user ID/);
    expect(remapArgsRefusal(from, "https://clerk.example.com|user_2abc")).toMatch(
      /Clerk user ID/,
    );
  });

  it("refuses an empty source", () => {
    expect(remapArgsRefusal(" ", to)).toMatch(/empty/);
  });
});

describe("isClerkUserId", () => {
  it("matches Clerk's user ID shape only", () => {
    expect(isClerkUserId("user_2abcDEFghiJKLmnoPQRstu")).toBe(true);
    expect(isClerkUserId("user_")).toBe(false);
    expect(isClerkUserId("user_abc def123456")).toBe(false);
    expect(isClerkUserId("sess_2abcDEFghiJKLmno")).toBe(false);
  });
});

describe("describeCounts", () => {
  it("lists non-empty tables", () => {
    expect(describeCounts({ loans: 2, apiKeys: 0, vaultItems: 1 })).toBe(
      "loans: 2, vaultItems: 1",
    );
    expect(describeCounts({ loans: 0 })).toBe("none");
  });
});
