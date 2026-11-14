"use client";

import { useEffect } from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";

import { useUserSettings } from "@/hooks/convex/onboarding";

/**
 * Light/dark theme through next-themes: toggles the `dark` class on <html>
 * (tailwind darkMode: ['class'], tokens in app/globals.css). Its blocking
 * inline script applies the last theme before paint; under strict CSP it
 * needs the request nonce (proxy.ts), which app/layout.tsx passes in.
 */
export function ThemeProvider({
  nonce,
  children,
}: {
  nonce?: string;
  children: React.ReactNode;
}) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={nonce}
    >
      {children}
    </NextThemesProvider>
  );
}

/**
 * Applies the signed-in user's stored userSettings.theme to next-themes. Runs
 * only when the stored value changes, so a live preview on the settings page
 * is not undone until it is saved or discarded. Must sit under
 * ConvexClientProvider.
 *
 * userSettings.language is stored but deliberately not applied to <html lang>:
 * every UI string is English, so lang stays "en" (app/layout.tsx) until the
 * UI is actually localised. Marking English pages lang="de" would make
 * browsers offer translation and screen readers mispronounce the text.
 */
export function ThemeSync() {
  const settings = useUserSettings();
  const { setTheme } = useTheme();
  const storedTheme = settings?.theme;

  useEffect(() => {
    if (storedTheme) setTheme(storedTheme);
  }, [storedTheme, setTheme]);

  return null;
}
