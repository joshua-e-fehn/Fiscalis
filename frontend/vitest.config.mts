import { defineConfig } from "vitest/config";

// Convex function tests (convex-test) in convex/tests/. The pure-logic suite
// lives in services/ with its own config; `bun run check` runs both.
export default defineConfig({
  test: {
    environment: "edge-runtime",
    include: ["convex/**/*.test.ts"],
    // convex-test and the components' test helpers ship TypeScript sources
    server: { deps: { inline: ["convex-test", /@convex-dev\//] } },
  },
});
