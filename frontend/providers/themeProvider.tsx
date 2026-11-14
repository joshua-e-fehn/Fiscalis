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
 * Applies the signed-in user's stored settings: userSettings.theme to
 * next-themes and userSettings.language to <html lang>. Runs only when the
 * stored values change, so a live preview on the settings page is not undone
 * until it is saved or discarded. Must sit under ConvexClientProvider.
 */
export function ThemeSync() {
  const settings = useUserSettings();
  const { setTheme } = useTheme();
  const storedTheme = settings?.theme;
  const storedLanguage = settings?.language;

  useEffect(() => {
    if (storedTheme) setTheme(storedTheme);
  }, [storedTheme, setTheme]);

  useEffect(() => {
    if (storedLanguage) document.documentElement.lang = storedLanguage;
  }, [storedLanguage]);

  return null;
}
