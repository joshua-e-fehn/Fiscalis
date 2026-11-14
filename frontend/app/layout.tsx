import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import { ClerkProvider } from "@clerk/nextjs";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { clerkLocalization } from "@/i18n/clerk";
import { languageForLocale, localeDirection } from "@/i18n/locales";
import { LocaleSync } from "@/providers/localeSync";
import { ThemeProvider, ThemeSync } from "@/providers/themeProvider";
import { Toaster } from "@/components/ui/shadcn/sonner";

import "./globals.css";
const inter = Inter({ subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("common.metadata");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Clerk's strict CSP (production, proxy.ts) puts the per-request nonce in the
  // x-nonce request header; next-themes' anti-flash inline script needs it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  // Resolved per request in i18n/request.ts (locale cookie, Accept-Language),
  // limited to the languages the UI is rendered in (RENDERED_LANGUAGES), so
  // <html lang>, Clerk and the metadata match the language of the content.
  const language = languageForLocale(await getLocale());

  return (
    // `dynamic` is required for strict CSP — the nonce is generated server-side
    // and must be passed to the client via dynamic rendering.
    // In dev mode strict CSP is disabled (see proxy.ts), but `dynamic` is harmless to keep.
    <ClerkProvider
      dynamic
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      waitlistUrl="/waitlist"
      localization={clerkLocalization(language)}
    >
      {/* next-themes sets the theme class on <html> before hydration */}
      <html lang={language} dir={localeDirection(language)} suppressHydrationWarning>
        <body className={inter.className}>
          {/* Inherits locale, messages, time zone and formats from i18n/request.ts */}
          <NextIntlClientProvider>
            <ThemeProvider nonce={nonce}>
              <ConvexClientProvider>
                <ThemeSync />
                <LocaleSync />
                {children}
                <Toaster richColors closeButton />
              </ConvexClientProvider>
            </ThemeProvider>
          </NextIntlClientProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
