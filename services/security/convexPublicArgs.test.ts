/**
 * Guard for ENG-156: public Convex functions must derive the user from
 * `ctx.auth` (see frontend/convex/lib/auth.ts), never from a client-supplied
 * `userId` arg. Fails if any exported `query` / `mutation` / `action` in
 * frontend/convex declares one. Internal functions are exempt — only server
 * code can call them.
 *
 * Guard for ENG-225: functions removed because they leaked PII or skipped
 * the provider-side revoke must not come back as public functions.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const CONVEX_DIR = path.resolve(__dirname, "../../frontend/convex");
const PUBLIC_BUILDERS = new Set(["query", "mutation", "action"]);
const FORBIDDEN_ARGS = new Set(["userId"]);

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (name === "_generated" || name === "node_modules") return [];
    if (statSync(full).isDirectory()) return listSourceFiles(full);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [full] : [];
  });
}

function propName(p: ts.ObjectLiteralElementLike): string | undefined {
  const name = p.name;
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

/** `export const foo = query({ args: { userId: ... } })` → "file:foo(userId)" */
export function findClientUserIdArgs(fileName: string, source: string) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
  const hits: string[] = [];

  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) continue;

    for (const decl of stmt.declarationList.declarations) {
      const init = decl.initializer;
      if (!init || !ts.isCallExpression(init)) continue;
      if (!ts.isIdentifier(init.expression)) continue;
      if (!PUBLIC_BUILDERS.has(init.expression.text)) continue;

      const [config] = init.arguments;
      if (!config || !ts.isObjectLiteralExpression(config)) continue;
      const argsProp = config.properties.find((p) => propName(p) === "args");
      if (!argsProp || !ts.isPropertyAssignment(argsProp)) continue;

      let argsObj: ts.Expression = argsProp.initializer;
      // args: v.object({ ... }) is also accepted by Convex
      if (ts.isCallExpression(argsObj) && argsObj.arguments[0]) {
        argsObj = argsObj.arguments[0];
      }
      if (!ts.isObjectLiteralExpression(argsObj)) continue;

      for (const p of argsObj.properties) {
        const name = propName(p);
        if (name && FORBIDDEN_ARGS.has(name)) {
          hits.push(`${fileName}:${decl.name.getText(sf)}(${name})`);
        }
      }
    }
  }
  return hits;
}

/** `export const foo = action({...})` → "file:foo" for every public builder */
export function findPublicFunctions(fileName: string, source: string) {
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest);
  const names: string[] = [];
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    const exported = stmt.modifiers?.some(
      (m) => m.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (!exported) continue;
    for (const decl of stmt.declarationList.declarations) {
      const init = decl.initializer;
      if (!init || !ts.isCallExpression(init)) continue;
      if (!ts.isIdentifier(init.expression)) continue;
      if (!PUBLIC_BUILDERS.has(init.expression.text)) continue;
      names.push(`${fileName}:${decl.name.getText(sf)}`);
    }
  }
  return names;
}

/**
 * Public functions removed in ENG-225: Plaid auth/identity returned account
 * numbers and identity PII; the delete mutations removed local data without
 * revoking the item/authorization at the provider (use the actions instead).
 */
const REMOVED_PUBLIC_FUNCTIONS = [
  "actions/plaid.ts:getAuth",
  "actions/plaid.ts:getIdentity",
  "banking.ts:deleteItem",
  "brokers.ts:deleteConnection",
];

describe("public Convex functions", () => {
  it("do not bring back removed PII or revoke-skipping functions", () => {
    const publicFunctions = new Set(
      listSourceFiles(CONVEX_DIR).flatMap((file) =>
        findPublicFunctions(
          path.relative(CONVEX_DIR, file).split(path.sep).join("/"),
          readFileSync(file, "utf8"),
        ),
      ),
    );
    expect(
      REMOVED_PUBLIC_FUNCTIONS.filter((name) => publicFunctions.has(name)),
    ).toEqual([]);
    // The auth debugging module (testAuth returned identity claims)
    expect(existsSync(path.join(CONVEX_DIR, "test.ts"))).toBe(false);
  });

  it("lists public functions only", () => {
    const src = `
      export const a = action({ args: {}, handler: h });
      export const b = internalAction({ args: {}, handler: h });
      const c = query({ args: {}, handler: h });
    `;
    expect(findPublicFunctions("x.ts", src)).toEqual(["x.ts:a"]);
  });

  it("never accept a client-supplied userId", () => {
    const hits = listSourceFiles(CONVEX_DIR).flatMap((file) =>
      findClientUserIdArgs(
        path.relative(CONVEX_DIR, file),
        readFileSync(file, "utf8"),
      ),
    );
    expect(hits).toEqual([]);
  });

  it("detects the pattern it guards against", () => {
    const src = `
      export const bad = query({ args: { userId: v.string() }, handler: h });
      export const badObj = mutation({ args: v.object({ "userId": v.string() }), handler: h });
      export const ok = internalQuery({ args: { userId: v.string() }, handler: h });
      const notExported = action({ args: { userId: v.string() }, handler: h });
    `;
    expect(findClientUserIdArgs("x.ts", src)).toEqual([
      "x.ts:bad(userId)",
      "x.ts:badObj(userId)",
    ]);
  });
});
