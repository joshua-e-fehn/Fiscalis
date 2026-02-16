/**
 * next.config.mjs — Next.js configuration
 *
 * Security headers (non-CSP) are defined here.
 * CSP is NOT set here — it is handled by Clerk's automatic strict mode in proxy.ts.
 *
 * @ai-agents
 * - Do NOT add a Content-Security-Policy header here; it would conflict with
 *   the nonce-based CSP that Clerk injects via proxy.ts.
 * - Keep `poweredByHeader: false` to avoid leaking framework info.
 * - If adding new headers, place them in the `securityHeaders` array.
 * - If a new third-party service needs CSP changes, edit proxy.ts, not this file.
 */
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════
// Security headers (non-CSP)
// CSP is handled by Clerk's automatic strict mode in proxy.ts
// ═══════════════════════════════════════════════════════════════
const securityHeaders = [
  {
    // Prevent the browser from MIME-sniffing (stops XSS via content-type confusion)
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // Prevent clickjacking by disallowing iframing of the app
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    // Control how much referrer information is sent with requests
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Enforce HTTPS for 1 year (includeSubDomains for all subdomains)
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    // Disable browser features that aren't needed
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    // Remove the X-Powered-By header (Next.js also has poweredByHeader: false)
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Set the workspace root for monorepo support
  outputFileTracingRoot: resolve(__dirname, ".."),
  // Turbopack config (used only in dev mode with --turbopack flag)
  turbopack: {
    root: resolve(__dirname, ".."),
  },
  // Disable the X-Powered-By: Next.js header (information leakage)
  poweredByHeader: false,
  // Security headers applied to all routes
  async headers() {
    return [
      {
        // Apply security headers to all routes
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
