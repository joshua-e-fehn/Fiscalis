/**
 * Local ESLint rule: Tailwind classes in app/ and components/ use logical
 * sides so the layout mirrors for right-to-left languages (Arabic, ENG-188).
 *
 * `ml-2` stays on the left in RTL; `ms-2` (margin-inline-start) moves to the
 * right. The rule reports a physical class in any string or template literal
 * and names its logical replacement. Where no logical class exists
 * (`space-x-*`, `translate-x-*`) the same string must carry the `rtl:`
 * counterpart. Directional icons (ArrowRight, ChevronLeft, ...) must flip in
 * RTL, e.g. with `rtl:-scale-x-100`.
 *
 * Intentional exceptions:
 * - `left-1/2` / `left-[50%]` with `-translate-x-1/2` centre an element and
 *   are symmetric, so they are allowed.
 * - Content that must stay left-to-right (charts, timelines) is wrapped in
 *   `dir="ltr"`; logical classes then resolve to left-to-right too.
 * - Anything else: `// eslint-disable-next-line fiscalis/no-physical-direction`
 *   with the reason.
 *
 * findPhysicalClasses() holds the matching and is unit-tested in
 * services/i18n/physicalDirection.test.ts.
 */

const PREFIXES = [
  ["scroll-ml-", "scroll-ms-"],
  ["scroll-mr-", "scroll-me-"],
  ["scroll-pl-", "scroll-ps-"],
  ["scroll-pr-", "scroll-pe-"],
  ["ml-", "ms-"],
  ["mr-", "me-"],
  ["pl-", "ps-"],
  ["pr-", "pe-"],
  ["left-", "start-"],
  ["right-", "end-"],
];

// Exact class or class followed by "-<value>".
const STEMS = [
  ["rounded-tl", "rounded-ss"],
  ["rounded-tr", "rounded-se"],
  ["rounded-bl", "rounded-es"],
  ["rounded-br", "rounded-ee"],
  ["rounded-l", "rounded-s"],
  ["rounded-r", "rounded-e"],
  ["border-l", "border-s"],
  ["border-r", "border-e"],
];

const EXACT = new Map([
  ["text-left", "text-start"],
  ["text-right", "text-end"],
  ["float-left", "float-start"],
  ["float-right", "float-end"],
  ["clear-left", "clear-start"],
  ["clear-right", "clear-end"],
]);

/** Symmetric centring, the same in both directions. */
const CENTRING = new Set(["left-1/2", "left-[50%]"]);
const CENTRING_TRANSLATE = new Set([
  "-translate-x-1/2",
  "translate-x-[-50%]",
  "translate-x-0",
]);

/** lucide-react icons that point along the inline axis. */
export const DIRECTIONAL_ICONS = new Set([
  "ArrowLeft",
  "ArrowRight",
  "ChevronLeft",
  "ChevronRight",
  "ChevronsLeft",
  "ChevronsRight",
]);

/** Strips variants (`md:`, `[&>svg]:`, `group-hover:`) and `!`. */
function utility(token) {
  let depth = 0;
  let start = 0;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === "[") depth++;
    else if (c === "]") depth--;
    else if (c === ":" && depth === 0) start = i + 1;
  }
  return token.slice(start).replace(/^!/, "");
}

function logicalFor(core) {
  const negative = core.startsWith("-");
  const name = negative ? core.slice(1) : core;
  const sign = negative ? "-" : "";
  if (EXACT.has(name)) return EXACT.get(name);
  for (const [stem, logical] of STEMS) {
    if (name === stem || name.startsWith(`${stem}-`)) {
      return logical + name.slice(stem.length);
    }
  }
  if (CENTRING.has(name)) return undefined;
  for (const [prefix, logical] of PREFIXES) {
    if (name.startsWith(prefix) && name.length > prefix.length) {
      return sign + logical + name.slice(prefix.length);
    }
  }
  return undefined;
}

/**
 * Physical-direction Tailwind classes in a class string, each with the fix.
 * @param {string} text
 * @returns {{ token: string, fix: string }[]}
 */
export function findPhysicalClasses(text) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const cores = tokens.map(utility);
  const found = [];
  const hasRtl = (re) =>
    tokens.some((t) => t.includes("rtl:") && re.test(utility(t)));

  tokens.forEach((token, i) => {
    const core = cores[i];
    const logical = logicalFor(core);
    if (logical) {
      found.push({ token, fix: token.slice(0, token.length - core.length) + logical });
      return;
    }
    if (/^-?space-x-/.test(core) && !cores.includes("space-x-reverse")) {
      found.push({ token, fix: `${token} rtl:space-x-reverse (or gap-*)` });
      return;
    }
    if (
      /^-?translate-x-/.test(core) &&
      !CENTRING_TRANSLATE.has(core) &&
      !token.includes("rtl:") &&
      !hasRtl(/^-?translate-x-/)
    ) {
      found.push({ token, fix: `${token} plus an rtl:translate-x-* counterpart` });
    }
  });
  return found;
}

/** @type {import("eslint").Rule.RuleModule} */
const noPhysicalDirection = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Use logical (start/end) Tailwind classes so the layout mirrors in RTL",
    },
    messages: {
      physical:
        "'{{token}}' does not mirror in right-to-left languages. Use '{{fix}}'.",
      icon: "<{{name}}> points along the inline axis: add an rtl: flip to its className (rtl:-scale-x-100), or wrap left-to-right content in dir=\"ltr\".",
    },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      if (typeof text !== "string" || !/[a-z]-|text-|float-/.test(text)) return;
      for (const { token, fix } of findPhysicalClasses(text)) {
        context.report({ node, messageId: "physical", data: { token, fix } });
      }
    }

    return {
      Literal(node) {
        if (node.parent?.type === "ImportDeclaration") return;
        check(node, node.value);
      },
      TemplateElement(node) {
        check(node, node.value.cooked);
      },
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        if (!DIRECTIONAL_ICONS.has(node.name.name)) return;
        const className = node.attributes.find(
          (a) => a.type === "JSXAttribute" && a.name.name === "className",
        );
        const source = className ? context.sourceCode.getText(className) : "";
        if (!source.includes("rtl:")) {
          context.report({
            node,
            messageId: "icon",
            data: { name: node.name.name },
          });
        }
      },
    };
  },
};

const plugin = { rules: { "no-physical-direction": noPhysicalDirection } };

export default plugin;
