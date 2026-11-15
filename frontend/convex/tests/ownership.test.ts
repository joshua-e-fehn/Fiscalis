/**
 * Trust boundary (ENG-237): every public query and mutation, found by
 * walking the deployed modules, is called by a second user with the first
 * user's document ids. The call must fail or come back without any of the
 * owner's data, and must leave the owner's documents as they were. A
 * positive control calls the same function as the owner, so a rejection is
 * the ownership check and not bad arguments.
 *
 * A new public function is covered automatically. If its arguments cannot be
 * generated, or the owner's own call fails with the generated ones, add an
 * entry to ARG_OVERRIDES.
 */
import http from "node:http";
import https from "node:https";
import { makeFunctionReference } from "convex/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { encrypt } from "../lib/encryption";
import {
  INTRUDER,
  NOW,
  OWNER,
  dumpAll,
  newTest,
  publicFunctions,
  seedUser,
  type PublicFunction,
  type TestConvex,
  type ValidatorJSON,
} from "./setup.helpers";

type Args = Record<string, unknown>;

/** A 32-byte AES key for the tests only. */
const TEST_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

/** Owner-specific strings: provider ids embed the user (lib/demoData.ts). */
const OWNER_MARKERS = [OWNER, OWNER.replace(/[^A-Za-z0-9]/g, "")];

/** Arguments for the functions the generator cannot serve (replace its output). */
const ARG_OVERRIDES: Record<string, (ids: SeedIds) => Args> = {
  "metalPrices:closes": () => ({ resolution: "day", from: NOW - 86_400_000 * 30 }),
  "onboarding:saveUserSettings": () => ({ defaultCurrency: "EUR", language: "en", theme: "dark" }),
  "onboarding:updateOnboardingStep": () => ({ step: 2 }),
  "onboarding:skipStep": () => ({ step: 2, nextStep: 3 }),
  "onboarding:setBirthDate": () => ({ birthDate: "1990-01-01" }),
  "classification:overridePlaidAccountClassification": (ids) => ({
    accountId: ids.plaidAccounts[0],
    category: "cash",
    subcategory: "savings-accounts",
  }),
  "classification:overrideBrokerPositionClassification": (ids) => ({
    positionId: ids.brokerPositions[0],
    category: "bonds",
    subcategory: "government",
  }),
  "bitpanda:setUserOverride": (ids) => ({
    holdingId: ids.bitpandaHoldings[0],
    category: "equities",
    subcategory: "stocks",
  }),
  "loans:recordPayment": (ids) => ({
    loanId: ids.loans[0],
    paymentDate: "2026-11-01",
    amount: 500,
    principalPortion: 500,
    interestPortion: 0,
    paymentType: "additional_principal",
  }),
  "loans:updatePayment": (ids) => ({ paymentId: ids.loanPayments[0], amount: 1300 }),
  "loans:updateLoan": (ids) => ({ loanId: ids.loans[0], name: "Renamed" }),
  "loans:saveScenario": (ids) => ({ loanId: ids.loans[0], name: "More", extraPerPeriod: 100 }),
  "loans:updateScenario": (ids) => ({ scenarioId: ids.loanScenarios[0], name: "Renamed" }),
  "vault:updateVaultItem": (ids) => ({ vaultItemId: ids.vaultItems[0], storageLocation: "Home" }),
  "vault:addTransaction": (ids) => ({
    vaultItemId: ids.vaultItems[0],
    transactionType: "buy",
    quantity: 1,
    pricePerUnit: 6000,
    currency: "EUR",
    transactionDate: "2026-11-01",
  }),
  "vault:sellItems": (ids) => ({
    sales: [{ vaultItemId: ids.vaultItems[0], quantity: 1, pricePerUnit: 7000 }],
    currency: "EUR",
    transactionDate: "2026-11-01",
  }),
  "vault:addVaultItemFromCatalog": (ids) => ({ catalogItemId: ids.metalCatalog[0], quantity: 1 }),
  "manualAssets:create": (ids) => ({
    category: "collectibles",
    subcategory: "watches",
    name: "Demo watch",
    currency: "EUR",
    valuations: [{ date: "2026-11-01", value: 5000 }],
    linkedLoanId: ids.loans[0],
  }),
  "manualAssets:update": (ids) => ({
    assetId: ids.manualAssets[0],
    category: "real-estate",
    subcategory: "residential",
    name: "Renamed",
    currency: "EUR",
    valuations: [{ date: "2026-11-01", value: 350000 }],
  }),
  "retirement:saveRetirementPlan": (ids) => ({ primaryResidenceLoanId: ids.loans[0] }),
  "retirement:getFundingBase": (ids) => ({ primaryResidenceLoanId: ids.loans[0] }),
};

/**
 * Functions whose owner call legitimately leaves the stored data as it was
 * (so the mutation positive control only checks that it did not throw).
 */
const OWNER_NOOP = new Set<string>([
  // The seeded classification is the automatic one already
  "classification:resetPlaidAccountClassification",
  "classification:resetBrokerPositionClassification",
]);

/** Owner document ids by table, plus `metalCatalog` and the Plaid `plaidItemId`. */
type SeedIds = Record<string, string[]>;

// ── Argument generation ──────────────────────────────────────────

const STRING_FIELDS: Record<string, (ids: SeedIds) => unknown> = {
  itemId: (ids) => ids.plaidItemId[0],
  currency: () => "EUR",
  defaultCurrency: () => "EUR",
  today: () => "2026-11-15",
  birthDate: () => "1990-01-01",
  indicatorCode: () => "NY.GDP.MKTP.CD",
  code: () => "NY.GDP.MKTP.CD",
  symbol: () => "VWCE",
  category: () => "equities",
  query: () => "gdp",
  cursor: () => null,
};

/** String args that name an owner's row by its provider id (plaidItems.itemId). */
const OWNER_REF_FIELDS = new Set(["itemId"]);

/** Whether a validator can carry a document id. */
function hasId(v: ValidatorJSON): boolean {
  switch (v.type) {
    case "id":
      return true;
    case "union":
      return v.value.some(hasId);
    case "array":
      return hasId(v.value);
    case "object":
      return Object.values(v.value).some((f) => hasId(f.fieldType));
    default:
      return false;
  }
}

function generate(v: ValidatorJSON, field: string, ids: SeedIds): unknown {
  if (field in STRING_FIELDS && v.type !== "id" && v.type !== "object") {
    return STRING_FIELDS[field](ids);
  }
  switch (v.type) {
    case "id": {
      const pool = (ids as Record<string, string[] | undefined>)[v.tableName];
      if (!pool?.length) throw new Error(`no seeded ${v.tableName} for ${field}`);
      return pool[0];
    }
    case "string":
      return /date|from|until/i.test(field) ? "2026-11-01" : "demo";
    case "number":
    case "float64":
      return 1;
    case "boolean":
      return false;
    case "null":
      return null;
    case "literal":
      return v.value;
    case "union": {
      const choice = v.value.find(hasId) ?? v.value.find((m) => m.type !== "null");
      return generate(choice ?? v.value[0], field, ids);
    }
    case "array":
      return hasId(v.value) ? [generate(v.value, field, ids)] : [];
    case "record":
      return {};
    case "object": {
      const out: Args = {};
      for (const [key, f] of Object.entries(v.value)) {
        if (f.optional && !hasId(f.fieldType) && !OWNER_REF_FIELDS.has(key)) continue;
        out[key] = generate(f.fieldType, key, ids);
      }
      return out;
    }
    default:
      throw new Error(`cannot generate ${v.type} for ${field}`);
  }
}

function argsFor(fn: PublicFunction, ids: SeedIds): Args {
  const override = ARG_OVERRIDES[fn.name];
  return override ? override(ids) : (generate(fn.args, "", ids) as Args);
}

// ── Setup ────────────────────────────────────────────────────────

async function seededTest(): Promise<{ t: TestConvex; ids: SeedIds }> {
  const t = newTest();
  const owner = await seedUser(t, OWNER);
  await seedUser(t, INTRUDER);
  const catalogId = await t.run((ctx) =>
    ctx.db.insert("metalCatalog", {
      name: "Krugerrand 1 oz",
      metalType: "gold",
      category: "coin",
      purity: 0.9167,
      weightGrams: 33.93,
      fineWeightGrams: 31.1,
      fineWeightOz: 1,
      defaultBuyPremium: 0.04,
      defaultSellPremium: 0,
      isPopular: true,
    }),
  );
  // Real ciphertext for the provider secrets, so actions get past decrypting
  // the caller's own credentials to the ownership check
  await t.run(async (ctx) => {
    const secret = encrypt("test-secret", TEST_ENCRYPTION_KEY);
    for (const row of await ctx.db.query("plaidItems").collect()) {
      await ctx.db.patch(row._id, { accessToken: secret });
    }
    for (const row of await ctx.db.query("snaptradeUsers").collect()) {
      await ctx.db.patch(row._id, { snaptradeUserSecret: secret });
    }
    for (const row of await ctx.db.query("bitpandaConnections").collect()) {
      await ctx.db.patch(row._id, { apiKey: secret });
    }
  });
  const plaidItemId = await t.run(async (ctx) => {
    const item = await ctx.db.get(owner.plaidItems![0]);
    return item!.itemId;
  });
  const ids: SeedIds = {
    ...(owner as SeedIds),
    metalCatalog: [catalogId],
    plaidItemId: [plaidItemId],
  };
  return { t, ids };
}

type Outcome = { ok: true; value: unknown } | { ok: false; error: string };

async function call(
  t: TestConvex,
  fn: PublicFunction,
  args: Args,
  subject: string | null,
): Promise<Outcome> {
  const caller = subject ? t.withIdentity({ subject }) : t;
  try {
    const value =
      fn.kind === "query"
        ? await caller.query(makeFunctionReference<"query", Args>(fn.name), args)
        : fn.kind === "mutation"
          ? await caller.mutation(makeFunctionReference<"mutation", Args>(fn.name), args)
          : await caller.action(makeFunctionReference<"action", Args>(fn.name), args);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** Owner ids and markers found in `value`. */
function ownerReferences(value: unknown, ownerIds: Set<string>): string[] {
  const text = JSON.stringify(value) ?? "";
  const hits = OWNER_MARKERS.filter((m) => text.includes(m));
  for (const id of ownerIds) if (text.includes(id)) hits.push(id);
  return hits;
}

/** Documents of the owner, and every other document that points at one. */
async function ownerFootprint(t: TestConvex, ownerIds: Set<string>) {
  const docs = await dumpAll(t);
  const owned: Record<string, unknown> = {};
  const pointing: string[] = [];
  for (const [id, doc] of docs) {
    if (doc.userId === OWNER) owned[id] = doc;
    else if (ownerReferences(doc, ownerIds).length) pointing.push(id);
  }
  return { owned, pointing };
}

// ── Tests ────────────────────────────────────────────────────────

const functions = publicFunctions();

// Actions reach the providers; in tests every outbound request fails, so an
// action must decide on ownership before it gets there.
// The provider SDKs use axios, which goes through node:http(s), not fetch.
const offline = () => {
  throw new Error("network disabled in tests");
};
beforeAll(() => {
  // Lets the SnapTrade actions get past their config check to the ownership
  // check (the client never connects, see below)
  vi.stubEnv("SNAPTRADE_CLIENT_ID", "test-client");
  vi.stubEnv("SNAPTRADE_SECRET", "test-secret");
  vi.stubEnv("CONVEX_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);
  vi.stubGlobal("fetch", () => Promise.reject(new Error("network disabled in tests")));
  for (const mod of [http, https]) {
    vi.spyOn(mod, "request").mockImplementation(offline);
    vi.spyOn(mod, "get").mockImplementation(offline);
  }
});
afterAll(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("public function enumeration", () => {
  it("finds the app's public queries, mutations and actions", () => {
    expect(functions.length).toBeGreaterThan(100);
    expect(functions.map((f) => f.name)).toContain("actions/plaid:disconnectItem");
    expect(functions.map((f) => f.name)).toContain("loans:deleteLoan");
  });
});

/** A seeded deployment, with the ids of every owner document in it. */
async function fresh() {
  const { t, ids } = await seededTest();
  const ownerIds = new Set(Object.keys((await ownerFootprint(t, new Set())).owned));
  return { t, ids, ownerIds };
}

describe.each(functions.map((fn) => [fn.name, fn] as const))(
  "%s",
  (_, fn) => {
    it("does not let another user read or change the owner's data", async () => {
      const { t, ids, ownerIds } = await fresh();
      const args = argsFor(fn, ids);
      const before = await ownerFootprint(t, ownerIds);

      const outcome = await call(t, fn, args, INTRUDER);
      if (outcome.ok) {
        expect(ownerReferences(outcome.value, ownerIds), "leaked").toEqual([]);
      }
      const after = await ownerFootprint(t, ownerIds);
      expect(after.owned, "owner's documents changed").toEqual(before.owned);
      expect(after.pointing, "intruder's documents point at the owner's").toEqual(
        before.pointing,
      );
    });

    it("does not let a signed-out caller read or change the owner's data", async () => {
      const { t, ids, ownerIds } = await fresh();
      const args = argsFor(fn, ids);
      const before = await ownerFootprint(t, ownerIds);
      const outcome = await call(t, fn, args, null);
      if (outcome.ok) {
        expect(ownerReferences(outcome.value, ownerIds), "leaked").toEqual([]);
      }
      expect((await ownerFootprint(t, ownerIds)).owned).toEqual(before.owned);
    });

    // Actions need the providers for the owner's own call, so they get the
    // two negative checks only
    if (fn.kind !== "action" && targetsOwnerData(fn)) {
      it("serves the owner with the same arguments (positive control)", async () => {
        const { t, ids, ownerIds } = await fresh();
        const args = argsFor(fn, ids);
        const before = await ownerFootprint(t, ownerIds);
        const intruder = await call(t, fn, args, INTRUDER);
        const owner = await call(t, fn, args, OWNER);
        expect(owner.ok ? "ok" : owner.error, "owner's own call failed").toBe("ok");
        if (fn.kind === "query") {
          expect(owner, "owner's result is the same as the intruder's").not.toEqual(intruder);
        } else if (!OWNER_NOOP.has(fn.name)) {
          const after = await ownerFootprint(t, ownerIds);
          expect(after.owned, "owner's call changed nothing").not.toEqual(before.owned);
        }
      });
    }
  },
);

/** Whether the generated arguments name one of the owner's documents. */
function targetsOwnerData(fn: PublicFunction): boolean {
  const fields = fn.args.type === "object" ? fn.args.value : {};
  return hasId(fn.args) || Object.keys(fields).some((k) => OWNER_REF_FIELDS.has(k));
}
