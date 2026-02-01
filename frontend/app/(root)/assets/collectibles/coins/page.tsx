"use client";

/**
 * Numismatic Coins - Overview
 *
 * Track collectible coins (not bullion):
 * - Rare/historical coins
 * - Grading (NGC, PCGS)
 * - Mintage, condition, provenance
 *
 * Note: Bullion coins valued for metal content → /commodities/metals
 *       Numismatic coins valued for rarity/history → here
 */

export default function CoinsPage() {
  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">🪙 Numismatic Coins</h1>
      <p className="text-muted-foreground">
        Track your rare and collectible coins.
      </p>
    </div>
  );
}
