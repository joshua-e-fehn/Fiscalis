/**
 * Local ESLint rule: a caught error must not reach console.* unsanitised.
 *
 * Provider SDKs (Plaid, SnapTrade, Bitpanda) throw axios errors whose
 * `config` / `request` carry credentials, so a raw `console.error(error)`
 * writes them into the server logs (ENG-218). Any use of a catch-clause
 * binding inside a console call's arguments is reported unless it passes
 * through describeError() or redactSecrets() from
 * services/security/providerError.ts first. That covers the bare identifier,
 * `${error}`, `{ error }`, `error.message`, `JSON.stringify(error)` and so on.
 */

const SANITIZERS = new Set(["describeError", "redactSecrets"]);

function calleeName(callee) {
  if (callee.type === "Identifier") return callee.name;
  if (callee.type === "MemberExpression" && !callee.computed) {
    return callee.property.name;
  }
  return undefined;
}

function isConsoleCall(node) {
  return (
    node.type === "CallExpression" &&
    node.callee.type === "MemberExpression" &&
    node.callee.object.type === "Identifier" &&
    node.callee.object.name === "console"
  );
}

/** @type {import("eslint").Rule.RuleModule} */
const noRawErrorLog = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow logging a caught error without describeError()/redactSecrets()",
    },
    messages: {
      raw: "Caught error '{{name}}' is logged raw and may leak provider credentials. Log describeError({{name}}) from services/security/providerError.ts instead.",
    },
    schema: [],
  },
  create(context) {
    // Walks up from each reference to the node that declares the error, so a
    // reference inside a callback in the console arguments
    // (`console.error(list.map(() => error))`) is still reported.
    function check(variable, declaringNode) {
      for (const reference of variable.references) {
        let child = reference.identifier;
        let parent = child.parent;
        while (parent && child !== declaringNode) {
          if (parent.type === "CallExpression" && child !== parent.callee) {
            if (SANITIZERS.has(calleeName(parent.callee))) break;
            if (isConsoleCall(parent)) {
              context.report({
                node: reference.identifier,
                messageId: "raw",
                data: { name: variable.name },
              });
              break;
            }
          }
          child = parent;
          parent = parent.parent;
        }
      }
    }

    return {
      CatchClause(node) {
        if (!node.param) return;
        context.sourceCode
          .getDeclaredVariables(node)
          .forEach((variable) => check(variable, node));
      },
      // promise.catch((error) => console.error(error)) and
      // promise.then(onFulfilled, (error) => console.error(error))
      "CallExpression[callee.property.name='catch'] > :function.arguments:first-child, CallExpression[callee.property.name='then'] > :function.arguments:nth-child(2)"(
        node,
      ) {
        const first = node.params[0];
        if (first?.type !== "Identifier") return;
        context.sourceCode
          .getDeclaredVariables(node)
          .filter((variable) => variable.name === first.name)
          .forEach((variable) => check(variable, node));
      },
    };
  },
};

const plugin = { rules: { "no-raw-error-log": noRawErrorLog } };

export default plugin;
