/// <reference types="vite/client" />
/**
 * Shared convex-test setup for the suites in this folder. The file name has
 * two dots so the Convex bundler skips it (like *.test.ts): it is test code,
 * not a deployable module.
 */
import { convexTest } from "convex-test";
import migrationsTest from "@convex-dev/migrations/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import type { TableNames } from "../_generated/dataModel";
import schema from "../schema";
import { insertDemoData, type DemoIds } from "../lib/demoData";

// import.meta.glob takes literals only, so the two globs repeat the patterns.

/** Lazily loaded function modules, as convex-test expects them. */
export const modules = import.meta.glob([
  "../**/*.*s",
  "!../**/*.test.ts",
  "!../**/*.helpers.ts",
  "!../convex.config.ts",
]);

/** A fresh in-memory deployment with this app's components. */
export function newTest() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t);
  migrationsTest.register(t);
  return t;
}

export type TestConvex = ReturnType<typeof newTest>;

export const OWNER = "user_owner";
export const INTRUDER = "user_intruder";

/** Fixed clock for seeded data (2026-11-15 12:00 UTC). */
export const NOW = Date.UTC(2026, 10, 15, 12);

/** Seeds the demo dataset for `userId` and returns its document ids. */
export async function seedUser(t: TestConvex, userId: string): Promise<DemoIds> {
  return await t.run((ctx) => insertDemoData(ctx, userId, NOW));
}

export const TABLES = Object.keys(schema.tables) as TableNames[];

/** Every document in the deployment, by id. */
export async function dumpAll(
  t: TestConvex,
): Promise<Map<string, Record<string, unknown>>> {
  // t.run returns Convex values only, so the map is built outside
  const docs = await t.run(async (ctx) => {
    const all: Record<string, unknown>[] = [];
    for (const table of TABLES) all.push(...(await ctx.db.query(table).collect()));
    return all;
  });
  return new Map(docs.map((doc) => [doc._id as string, doc]));
}

// ── Public function enumeration ───────────────────────────────────

/** Convex's JSON form of an argument validator (`fn.exportArgs()`). */
export type ValidatorJSON =
  | { type: "id"; tableName: string }
  | { type: "string" | "number" | "boolean" | "null" | "any" | "bigint" | "bytes" | "int64" | "float64" }
  | { type: "literal"; value: string | number | boolean }
  | { type: "union"; value: ValidatorJSON[] }
  | { type: "array"; value: ValidatorJSON }
  | { type: "record"; keys: ValidatorJSON; values: { fieldType: ValidatorJSON } }
  | {
      type: "object";
      value: Record<string, { fieldType: ValidatorJSON; optional: boolean }>;
    };

export type PublicFunction = {
  /** Convex function name, e.g. "banking:getItems" or "actions/plaid:exchangeToken" */
  name: string;
  kind: "query" | "mutation" | "action";
  args: ValidatorJSON;
};

type RegisteredFn = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
  exportArgs?: () => string;
};

const eagerModules = import.meta.glob<Record<string, unknown>>(
  [
    "../**/*.ts",
    "!../**/*.test.ts",
    "!../**/*.helpers.ts",
    "!../convex.config.ts",
    "!../_generated/**",
  ],
  { eager: true },
);

/** Every public query, mutation and action the app deploys. */
export function publicFunctions(): PublicFunction[] {
  const found: PublicFunction[] = [];
  for (const [path, mod] of Object.entries(eagerModules)) {
    const moduleName = path.replace(/^\.\.\//, "").replace(/\.[jt]s$/, "");
    for (const [exportName, value] of Object.entries(mod)) {
      const fn = value as RegisteredFn | null;
      if (!fn || (typeof fn !== "object" && typeof fn !== "function")) continue;
      if (!fn.isPublic || !fn.exportArgs) continue;
      const kind = fn.isQuery
        ? "query"
        : fn.isMutation
          ? "mutation"
          : fn.isAction
            ? "action"
            : null;
      if (!kind) continue;
      found.push({
        name: `${moduleName}:${exportName}`,
        kind,
        args: JSON.parse(fn.exportArgs()) as ValidatorJSON,
      });
    }
  }
  return found.sort((a, b) => a.name.localeCompare(b.name));
}
