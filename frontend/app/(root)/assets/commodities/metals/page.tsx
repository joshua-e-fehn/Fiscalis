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
import { MetalsPage } from "@/components/atomic/organisms/metals";
import { MetalsCurrency } from "@/lib/types/metals-extended";

export default function PreciousMetalsPage() {
  const { userId } = useAuth();

  // TODO: Get user preference for currency
  const currency: MetalsCurrency = "eur";

  if (!userId) {
    return (
      <div className="container mx-auto py-6 text-center">
        <p className="text-muted-foreground">
          Please sign in to view your metals portfolio.
        </p>
      </div>
    );
  }

  return <MetalsPage userId={userId} currency={currency} />;
}
