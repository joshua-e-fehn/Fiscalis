import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = path.resolve(__dirname, "..");

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["**/*.test.ts"],
  },
  resolve: {
    alias: [
      // Handle @/../services path used in frontend code
      // The @ points to frontend/, so @/../services goes up from frontend to root, then into services
      {
        find: /^@\/\.\.\/(.*)/,
        replacement: path.join(rootDir, "$1"),
      },
      // Standard @/ alias for frontend
      {
        find: /^@\/(.*)/,
        replacement: path.join(rootDir, "frontend", "$1"),
      },
    ],
  },
});
