import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ACCOUNT_DELETE_PHRASE,
  USER_DATA_TABLES,
  USER_DATA_TABLE_NAMES,
  buildUserDataExport,
  deletedClerkUserId,
  excludedFieldList,
  exportFileName,
  isAccountDeleteConfirmation,
  redactForExport,
} from "./userData";

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

/** Tables that store a userId field at the top level. */
function userOwnedSchemaTables(): string[] {
  return [...schemaTables()]
    .filter(([, source]) => /^\t\tuserId: v\./m.test(source))
    .map(([name]) => name)
    .sort();
}

describe("user data registry", () => {
  it("parses the schema", () => {
    // Guards the parser itself: a format change must not make the
    // coverage checks below pass vacuously
    expect(schemaTables().size).toBeGreaterThan(20);
    expect(userOwnedSchemaTables()).toContain("plaidItems");
  });

  it("covers every user-owned table in the schema (export and purge both read it)", () => {
    expect([...USER_DATA_TABLE_NAMES].sort()).toEqual(userOwnedSchemaTables());
  });

  it("lists each table once", () => {
    expect(new Set(USER_DATA_TABLE_NAMES).size).toBe(USER_DATA_TABLE_NAMES.length);
  });

  it("only lists tables with a by_user index on userId", () => {
    const tables = schemaTables();
    for (const name of USER_DATA_TABLE_NAMES) {
      expect(tables.get(name), name).toMatch(
        /\.index\("by_user", \["userId"\]\)/,
      );
    }
  });

  it("only excludes fields the table has", () => {
    const tables = schemaTables();
    for (const { table, excludedFields } of USER_DATA_TABLES) {
      for (const field of excludedFields) {
        expect(tables.get(table), `${table}.${field}`).toMatch(
          new RegExp(`^\\t\\t${field}: v\\.`, "m"),
        );
      }
    }
  });

  it("excludes every encrypted credential and key hash", () => {
    expect(excludedFieldList().sort()).toEqual(
      [
        "apiKeys.keyHash",
        "bitpandaConnections.apiKey",
        "plaidItems.accessToken",
        "snaptradeUsers.snaptradeUserSecret",
      ].sort(),
    );
  });

  it("purges credentials and the sync roster before the data they feed", () => {
    const order = USER_DATA_TABLE_NAMES;
    const firstData = order.indexOf("plaidAccounts");
    for (const t of ["syncTargets", "plaidItems", "snaptradeUsers", "bitpandaConnections"] as const) {
      expect(order.indexOf(t)).toBeLessThan(firstData);
    }
  });
});

describe("redactForExport", () => {
  it("drops excluded fields and keeps the rest", () => {
    const doc = { _id: "1", userId: "u", accessToken: "enc", itemId: "i" };
    expect(redactForExport("plaidItems", doc)).toEqual({
      _id: "1",
      userId: "u",
      itemId: "i",
    });
    expect(doc.accessToken).toBe("enc");
  });

  it("leaves tables without secrets untouched", () => {
    const doc = { _id: "1", userId: "u", name: "Loan" };
    expect(redactForExport("loans", doc)).toBe(doc);
  });
});

describe("buildUserDataExport", () => {
  it("keys tables by name and lists the exclusions", () => {
    const now = new Date("2026-11-15T10:00:00Z");
    const result = buildUserDataExport("user_1", { loans: [] }, now);
    expect(result).toMatchObject({
      format: "fiscalis-user-data",
      exportedAt: "2026-11-15T10:00:00.000Z",
      userId: "user_1",
      tables: { loans: [] },
    });
    expect(result.excluded).toContain("plaidItems.accessToken");
    expect(exportFileName(now)).toBe("fiscalis-data-2026-11-15.json");
  });
});

describe("isAccountDeleteConfirmation", () => {
  it("needs the exact phrase", () => {
    expect(isAccountDeleteConfirmation(ACCOUNT_DELETE_PHRASE)).toBe(true);
    expect(isAccountDeleteConfirmation(` ${ACCOUNT_DELETE_PHRASE} `)).toBe(true);
    expect(isAccountDeleteConfirmation("delete")).toBe(false);
    expect(isAccountDeleteConfirmation("")).toBe(false);
  });
});

describe("deletedClerkUserId", () => {
  it("reads the user of a user.deleted event", () => {
    expect(
      deletedClerkUserId({ type: "user.deleted", data: { id: "user_1", deleted: true } }),
    ).toBe("user_1");
  });

  it("ignores other events and malformed payloads", () => {
    expect(deletedClerkUserId({ type: "user.created", data: { id: "user_1" } })).toBeNull();
    expect(deletedClerkUserId({ type: "user.deleted", data: {} })).toBeNull();
    expect(deletedClerkUserId({ type: "user.deleted", data: { id: "" } })).toBeNull();
    expect(deletedClerkUserId(null)).toBeNull();
    expect(deletedClerkUserId("user.deleted")).toBeNull();
  });
});
