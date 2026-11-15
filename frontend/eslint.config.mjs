import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

import physicalDirection from "./eslint-rules/no-physical-direction.mjs";
import rawErrorLog from "./eslint-rules/no-raw-error-log.mjs";

const fiscalis = {
  rules: { ...rawErrorLog.rules, ...physicalDirection.rules },
};

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    ignores: [
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "convex/_generated/**",
    ],
  },
  {
    rules: {
      // A rest-destructuring sibling is how we drop a field from an object.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { ignoreRestSiblings: true },
      ],
    },
  },
  {
    // i18n guard: user-visible JSX text goes through next-intl (messages/),
    // so raw text between tags fails the lint. Only JSX text is checked:
    // props, attributes and string expressions are not. Bare symbols,
    // punctuation and the brand name need no translation.
    files: ["app/**/*.tsx", "components/**/*.tsx"],
    ignores: ["components/ui/**", "app/(api)/**"],
    rules: {
      "react/jsx-no-literals": [
        "error",
        {
          noStrings: false,
          ignoreProps: true,
          allowedStrings: [
            "Fiscalis",
            "%",
            "(",
            ")",
            "%)",
            "[",
            "]",
            ".",
            "…",
            "·",
            "•",
            "-",
            "--",
            "—",
            "−",
            "#",
          ],
        },
      ],
    },
  },
  {
    // RTL guard (ENG-188): page code uses logical start/end classes so the
    // layout mirrors in Arabic. The shadcn primitives in components/ui pick
    // physical sides on purpose (sheet sides, centred dialogs) and were
    // converted where needed in #157.
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["components/ui/**", "app/(api)/**"],
    plugins: { fiscalis },
    rules: { "fiscalis/no-physical-direction": "error" },
  },
  {
    // Server code must not log caught errors raw: provider SDK errors carry
    // credentials in their request config (ENG-218).
    files: ["convex/**/*.ts", "app/(api)/**/*.ts"],
    ignores: [
      // Owned by the open metal-price PRs: #66 deletes metals.ts and drops
      // the raw log in route.ts; fxRates.ts logs errorMessage(error) and is
      // rewritten by #65. Remove these entries once those land.
      "app/(api)/**/metals.ts",
      "app/(api)/**/route.ts",
      "convex/fxRates.ts",
    ],
    plugins: { fiscalis },
    rules: { "fiscalis/no-raw-error-log": "error" },
  },
];

export default eslintConfig;
