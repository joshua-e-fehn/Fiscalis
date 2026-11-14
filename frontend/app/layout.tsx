import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";

import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { ThemeProvider, ThemeSync } from "@/providers/themeProvider";

import "./globals.css";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fiscalis",
  description: "Have a look at your financial future!",
};

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Clerk's strict CSP (production, proxy.ts) puts the per-request nonce in the
  // x-nonce request header; next-themes' anti-flash inline script needs it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    // `dynamic` is required for strict CSP — the nonce is generated server-side
    // and must be passed to the client via dynamic rendering.
    // In dev mode strict CSP is disabled (see proxy.ts), but `dynamic` is harmless to keep.
    <ClerkProvider dynamic signInUrl="/sign-in" signUpUrl="/sign-up">
      {/* next-themes sets the theme class on <html> before hydration */}
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <ThemeProvider nonce={nonce}>
            <ConvexClientProvider>
              <ThemeSync />
              {children}
            </ConvexClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
