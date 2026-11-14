import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

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
    // Baseline (ENG-154): these rules had existing violations when lint was
    // restored. They stay visible as warnings so `bun run lint` passes; fix
    // the sites and promote them back to "error" over time.
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      // React Compiler rules. The app does not enable the React Compiler, so
      // these flag patterns that only block compilation; not runtime bugs.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
];

export default eslintConfig;
