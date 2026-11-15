"use client";

import { DirectionProvider as RadixDirectionProvider } from "@radix-ui/react-direction";
import { useLocale } from "next-intl";

import { localeDirection } from "@/i18n/locales";

/**
 * Tells the Radix primitives the text direction of the rendered language
 * (right-to-left for Arabic), matching <html dir> in app/layout.tsx. Radix
 * does not read the document's dir: without this, menus, selects, sliders and
 * tabs would open, move and handle arrow keys as left-to-right. Components
 * that pick a physical side (the sidebar sheet, tooltips, popovers) read it
 * with useDirection() from @radix-ui/react-direction.
 */
export function DirectionProvider({ children }: { children: React.ReactNode }) {
  const dir = localeDirection(useLocale());
  return <RadixDirectionProvider dir={dir}>{children}</RadixDirectionProvider>;
}
