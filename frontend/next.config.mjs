import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Set the workspace root for monorepo support
  outputFileTracingRoot: resolve(__dirname, ".."),
  // Turbopack config (used only in dev mode with --turbopack flag)
  turbopack: {
    root: resolve(__dirname, ".."),
  },
};

export default nextConfig;
