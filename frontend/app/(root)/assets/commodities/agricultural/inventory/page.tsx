"use client";

/**
 * Agricultural Commodities - Inventory
 *
 * Track agricultural commodity positions:
 * - ETFs (DBA, CORN, WEAT, etc.)
 * - Futures contracts
 */

export default function AgriculturalInventoryPage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">My Agricultural Holdings</h1>
      <p className="text-muted-foreground">
        Track your agricultural commodity ETFs and futures.
      </p>
    </div>
  );
}
