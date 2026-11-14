"use client";

/**
 * Precious Metals Page
 *
 * Unified page for precious metals:
 * - Overview: Portfolio summary with allocation and performance
 * - Holdings: Individual metal items (coins, bars, etc.)
 * - History: Transaction history with CSV export
 * - Prices: Real-time price tracking and comparison charts
 */

import { useAuth } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { MetalsPage } from "@/components/atomic/organisms/metals";

export default function PreciousMetalsPage() {
  const { userId } = useAuth();
  const t = useTranslations("assets.metals");

  if (!userId) {
    return (
      <div className="container mx-auto py-6 text-center">
        <p className="text-muted-foreground">{t("signIn")}</p>
      </div>
    );
  }

  // Holdings and summaries follow the display currency (useMetals)
  return <MetalsPage />;
}
