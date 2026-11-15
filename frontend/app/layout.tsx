import type { Metadata } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
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
// Inter has no CJK glyphs. Without a generic family in the stack the browser
// draws Chinese (zh-Hans) in its default font, often a serif (SimSun,
// Songti), so name the platform CJK sans-serifs and end on sans-serif.
const inter = Inter({
  subsets: ["latin"],
  fallback: [
    '"PingFang SC"',
    '"Hiragino Sans GB"',
    '"Microsoft YaHei"',
    '"Noto Sans CJK SC"',
    '"Noto Sans SC"',
    "sans-serif",
  ],
});
// Inter has no Devanagari glyphs either. next/font self-hosts this with a
// Devanagari-only unicode-range, so it is listed first without a fallback
// face (Latin and CJK text fall through to Inter's stack) and browsers only
// fetch it for Hindi text; not preloaded because most pages never render any.
const devanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  preload: false,
  adjustFontFallback: false,
});

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
        <body
          className={inter.className}
          style={{
            fontFamily: `${devanagari.style.fontFamily}, ${inter.style.fontFamily}`,
          }}
        >
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
