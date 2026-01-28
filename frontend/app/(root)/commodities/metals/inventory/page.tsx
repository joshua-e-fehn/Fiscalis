"use client";

/**
 * Precious Metals - Inventory (Vault)
 *
 * Track physical precious metal holdings:
 * - Gold, Silver, Platinum, Palladium
 * - Coins, bars, jewelry, scrap
 * - Real-time valuations based on spot prices
 *
 * Uses Convex for storage + Supabase for live prices.
 */

import { useAuth } from "@clerk/nextjs";
import { MetalsInventoryPage as InventoryPage } from "@/components/atomic/organisms/metals";
import { MetalsCurrency } from "@/lib/types/metals-extended";

export default function MetalsInventoryPage() {
  const { userId } = useAuth();

  // TODO: Get user preference for currency
  const currency: MetalsCurrency = "eur";

  if (!userId) {
    return (
      <div className="container mx-auto py-6 text-center">
        <p className="text-muted-foreground">
          Please sign in to view your inventory.
        </p>
      </div>
    );
  }

  return <InventoryPage userId={userId} currency={currency} />;
}
