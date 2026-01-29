import { mutation } from "./_generated/server";
import { TROY_OUNCE_GRAMS } from "./lib/priceCalculations";

/**
 * Seed the metal catalog with popular coins and bars
 *
 * ⚠️ PLACEHOLDER PREMIUMS: The premiums listed are estimates based on typical
 * market ranges. They will be refined with real dealer data in a future update.
 * Users can override these per-item when adding to their vault.
 *
 * Run this mutation once to populate the catalog:
 * In Convex dashboard or via code: await ctx.runMutation(api.seedCatalog.seedMetalCatalog)
 */
export const seedMetalCatalog = mutation({
  args: {},
  handler: async (ctx) => {
    // Check if catalog already has data
    const existingItems = await ctx.db.query("metalCatalog").take(1);
    if (existingItems.length > 0) {
      console.log("Catalog already seeded, skipping...");
      return { message: "Catalog already seeded", count: 0 };
    }

    const catalogItems = [
      // ═══════════════════════════════════════════════════════════════
      // GOLD COINS
      // ═══════════════════════════════════════════════════════════════

      // Krugerrand (South Africa) - 22 karat (916.7)
      {
        name: "Krugerrand 1 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 33.93,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.035,
        defaultSellPremium: 0.0, // buy: 3.5%
        country: "South Africa",
        mint: "South African Mint",
        year: "various",
        diameter: 32.77,
        thickness: 2.84,
        isPopular: true,
      },
      {
        name: "Krugerrand 1/2 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 16.965,
        fineWeightGrams: 15.5517,
        fineWeightOz: 0.5,
        defaultBuyPremium: 0.05,
        defaultSellPremium: 0.0, // buy: 5%
        country: "South Africa",
        mint: "South African Mint",
        year: "various",
        diameter: 27.07,
        thickness: 2.215,
        isPopular: false,
      },
      {
        name: "Krugerrand 1/4 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 8.482,
        fineWeightGrams: 7.7758,
        fineWeightOz: 0.25,
        defaultBuyPremium: 0.06,
        defaultSellPremium: 0.0, // buy: 6%
        country: "South Africa",
        mint: "South African Mint",
        year: "various",
        diameter: 22.06,
        thickness: 1.888,
        isPopular: false,
      },
      {
        name: "Krugerrand 1/10 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 3.393,
        fineWeightGrams: 3.1103,
        fineWeightOz: 0.1,
        defaultBuyPremium: 0.08,
        defaultSellPremium: 0.0, // buy: 8%
        country: "South Africa",
        mint: "South African Mint",
        year: "various",
        diameter: 16.55,
        thickness: 1.35,
        isPopular: false,
      },

      // Canadian Maple Leaf - 24 karat (999.9)
      {
        name: "Maple Leaf 1 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.03,
        defaultSellPremium: 0.0, // buy: 3%
        country: "Canada",
        mint: "Royal Canadian Mint",
        year: "various",
        diameter: 30.0,
        thickness: 2.87,
        isPopular: true,
      },
      {
        name: "Maple Leaf 1/2 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 15.5517,
        fineWeightGrams: 15.5517,
        fineWeightOz: 0.5,
        defaultBuyPremium: 0.045,
        defaultSellPremium: 0.0, // buy: 4.5%
        country: "Canada",
        mint: "Royal Canadian Mint",
        year: "various",
        diameter: 25.0,
        thickness: 2.23,
        isPopular: false,
      },
      {
        name: "Maple Leaf 1/4 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 7.7758,
        fineWeightGrams: 7.7758,
        fineWeightOz: 0.25,
        defaultBuyPremium: 0.055,
        defaultSellPremium: 0.0, // buy: 5.5%
        country: "Canada",
        mint: "Royal Canadian Mint",
        year: "various",
        diameter: 20.0,
        thickness: 1.78,
        isPopular: false,
      },
      {
        name: "Maple Leaf 1/10 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 3.1103,
        fineWeightGrams: 3.1103,
        fineWeightOz: 0.1,
        defaultBuyPremium: 0.07,
        defaultSellPremium: 0.0, // buy: 7%
        country: "Canada",
        mint: "Royal Canadian Mint",
        year: "various",
        diameter: 16.0,
        thickness: 1.22,
        isPopular: false,
      },

      // American Gold Eagle - 22 karat (916.7)
      {
        name: "American Eagle 1 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 33.93,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.04,
        defaultSellPremium: 0.0, // buy: 4%
        country: "USA",
        mint: "US Mint",
        year: "various",
        diameter: 32.7,
        thickness: 2.87,
        isPopular: true,
      },
      {
        name: "American Eagle 1/2 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 16.965,
        fineWeightGrams: 15.5517,
        fineWeightOz: 0.5,
        defaultBuyPremium: 0.055,
        defaultSellPremium: 0.0, // buy: 5.5%
        country: "USA",
        mint: "US Mint",
        year: "various",
        diameter: 27.0,
        thickness: 2.24,
        isPopular: false,
      },
      {
        name: "American Eagle 1/4 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 8.483,
        fineWeightGrams: 7.7758,
        fineWeightOz: 0.25,
        defaultBuyPremium: 0.065,
        defaultSellPremium: 0.0, // buy: 6.5%
        country: "USA",
        mint: "US Mint",
        year: "various",
        diameter: 22.0,
        thickness: 1.83,
        isPopular: false,
      },
      {
        name: "American Eagle 1/10 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 916.7,
        weightGrams: 3.393,
        fineWeightGrams: 3.1103,
        fineWeightOz: 0.1,
        defaultBuyPremium: 0.085,
        defaultSellPremium: 0.0, // buy: 8.5%
        country: "USA",
        mint: "US Mint",
        year: "various",
        diameter: 16.5,
        thickness: 1.26,
        isPopular: false,
      },

      // Vienna Philharmonic - 24 karat (999.9)
      {
        name: "Philharmonic 1 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.03,
        defaultSellPremium: 0.0, // buy: 3%
        country: "Austria",
        mint: "Austrian Mint",
        year: "various",
        diameter: 37.0,
        thickness: 2.0,
        isPopular: true,
      },
      {
        name: "Philharmonic 1/2 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 15.5517,
        fineWeightGrams: 15.5517,
        fineWeightOz: 0.5,
        defaultBuyPremium: 0.045,
        defaultSellPremium: 0.0, // buy: 4.5%
        country: "Austria",
        mint: "Austrian Mint",
        year: "various",
        diameter: 28.0,
        thickness: 1.6,
        isPopular: false,
      },
      {
        name: "Philharmonic 1/4 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 7.7758,
        fineWeightGrams: 7.7758,
        fineWeightOz: 0.25,
        defaultBuyPremium: 0.055,
        defaultSellPremium: 0.0, // buy: 5.5%
        country: "Austria",
        mint: "Austrian Mint",
        year: "various",
        diameter: 22.0,
        thickness: 1.2,
        isPopular: false,
      },
      {
        name: "Philharmonic 1/10 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 3.1103,
        fineWeightGrams: 3.1103,
        fineWeightOz: 0.1,
        defaultBuyPremium: 0.07,
        defaultSellPremium: 0.0, // buy: 7%
        country: "Austria",
        mint: "Austrian Mint",
        year: "various",
        diameter: 16.0,
        thickness: 0.9,
        isPopular: false,
      },

      // Britannia - 24 karat (999.9)
      {
        name: "Britannia 1 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.035,
        defaultSellPremium: 0.0, // buy: 3.5%
        country: "United Kingdom",
        mint: "Royal Mint",
        year: "various",
        diameter: 32.69,
        thickness: 2.79,
        isPopular: true,
      },

      // Australian Kangaroo - 24 karat (999.9)
      {
        name: "Kangaroo 1 oz",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.035,
        defaultSellPremium: 0.0, // buy: 3.5%
        country: "Australia",
        mint: "Perth Mint",
        year: "various",
        diameter: 32.6,
        thickness: 2.65,
        isPopular: true,
      },

      // Chinese Panda - 24 karat (999)
      {
        name: "Chinese Panda 30g",
        metalType: "gold" as const,
        category: "coin" as const,
        purity: 999.0,
        weightGrams: 30.0,
        fineWeightGrams: 30.0,
        fineWeightOz: 0.9646,
        defaultBuyPremium: 0.08,
        defaultSellPremium: 0.0, // buy: 8% - higher collector premium
        country: "China",
        mint: "China Mint",
        year: "various",
        diameter: 32.0,
        thickness: 2.4,
        isPopular: false,
      },

      // ═══════════════════════════════════════════════════════════════
      // GOLD BARS
      // ═══════════════════════════════════════════════════════════════

      {
        name: "Gold Bar 1g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 1.0,
        fineWeightGrams: 1.0,
        fineWeightOz: 1.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.2,
        defaultSellPremium: 0.0, // buy: 20%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Gold Bar 2g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 2.0,
        fineWeightGrams: 2.0,
        fineWeightOz: 2.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.15,
        defaultSellPremium: 0.0, // buy: 15%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Gold Bar 5g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 5.0,
        fineWeightGrams: 5.0,
        fineWeightOz: 5.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.1,
        defaultSellPremium: 0.0, // buy: 10%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Gold Bar 10g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 10.0,
        fineWeightGrams: 10.0,
        fineWeightOz: 10.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.06,
        defaultSellPremium: 0.0, // buy: 6%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: true,
      },
      {
        name: "Gold Bar 20g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 20.0,
        fineWeightGrams: 20.0,
        fineWeightOz: 20.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.04,
        defaultSellPremium: 0.0, // buy: 4%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Gold Bar 1 oz",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.03,
        defaultSellPremium: 0.0, // buy: 3%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: true,
      },
      {
        name: "Gold Bar 50g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 50.0,
        fineWeightGrams: 50.0,
        fineWeightOz: 50.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.025,
        defaultSellPremium: 0.0, // buy: 2.5%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Gold Bar 100g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 100.0,
        fineWeightGrams: 100.0,
        fineWeightOz: 100.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.015,
        defaultSellPremium: 0.0, // buy: 1.5%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: true,
      },
      {
        name: "Gold Bar 250g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 250.0,
        fineWeightGrams: 250.0,
        fineWeightOz: 250.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.012,
        defaultSellPremium: 0.0, // buy: 1.2%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Gold Bar 500g",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 500.0,
        fineWeightGrams: 500.0,
        fineWeightOz: 500.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.01,
        defaultSellPremium: 0.0, // buy: 1%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Gold Bar 1kg",
        metalType: "gold" as const,
        category: "bar" as const,
        purity: 999.9,
        weightGrams: 1000.0,
        fineWeightGrams: 1000.0,
        fineWeightOz: 1000.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.008,
        defaultSellPremium: 0.0, // buy: 0.8%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: true,
      },

      // ═══════════════════════════════════════════════════════════════
      // SILVER COINS
      // ═══════════════════════════════════════════════════════════════

      {
        name: "Silver Maple Leaf 1 oz",
        metalType: "silver" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.15,
        defaultSellPremium: 0.0, // buy: 15% - silver typically has higher premiums
        country: "Canada",
        mint: "Royal Canadian Mint",
        year: "various",
        diameter: 38.0,
        thickness: 3.29,
        isPopular: true,
      },
      {
        name: "Silver American Eagle 1 oz",
        metalType: "silver" as const,
        category: "coin" as const,
        purity: 999.0,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.18,
        defaultSellPremium: 0.0, // buy: 18%
        country: "USA",
        mint: "US Mint",
        year: "various",
        diameter: 40.6,
        thickness: 2.98,
        isPopular: true,
      },
      {
        name: "Silver Philharmonic 1 oz",
        metalType: "silver" as const,
        category: "coin" as const,
        purity: 999.0,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.14,
        defaultSellPremium: 0.0, // buy: 14%
        country: "Austria",
        mint: "Austrian Mint",
        year: "various",
        diameter: 37.0,
        thickness: 3.2,
        isPopular: true,
      },
      {
        name: "Silver Britannia 1 oz",
        metalType: "silver" as const,
        category: "coin" as const,
        purity: 999.0,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.15,
        defaultSellPremium: 0.0, // buy: 15%
        country: "United Kingdom",
        mint: "Royal Mint",
        year: "various",
        diameter: 38.61,
        thickness: 3.0,
        isPopular: true,
      },
      {
        name: "Silver Kangaroo 1 oz",
        metalType: "silver" as const,
        category: "coin" as const,
        purity: 999.9,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.15,
        defaultSellPremium: 0.0, // buy: 15%
        country: "Australia",
        mint: "Perth Mint",
        year: "various",
        diameter: 40.6,
        thickness: 4.0,
        isPopular: false,
      },

      // ═══════════════════════════════════════════════════════════════
      // SILVER BARS
      // ═══════════════════════════════════════════════════════════════

      {
        name: "Silver Bar 1 oz",
        metalType: "silver" as const,
        category: "bar" as const,
        purity: 999.0,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.12,
        defaultSellPremium: 0.0, // buy: 12%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Silver Bar 100g",
        metalType: "silver" as const,
        category: "bar" as const,
        purity: 999.0,
        weightGrams: 100.0,
        fineWeightGrams: 100.0,
        fineWeightOz: 100.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.1,
        defaultSellPremium: 0.0, // buy: 10%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Silver Bar 250g",
        metalType: "silver" as const,
        category: "bar" as const,
        purity: 999.0,
        weightGrams: 250.0,
        fineWeightGrams: 250.0,
        fineWeightOz: 250.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.08,
        defaultSellPremium: 0.0, // buy: 8%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Silver Bar 500g",
        metalType: "silver" as const,
        category: "bar" as const,
        purity: 999.0,
        weightGrams: 500.0,
        fineWeightGrams: 500.0,
        fineWeightOz: 500.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.06,
        defaultSellPremium: 0.0, // buy: 6%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },
      {
        name: "Silver Bar 1kg",
        metalType: "silver" as const,
        category: "bar" as const,
        purity: 999.0,
        weightGrams: 1000.0,
        fineWeightGrams: 1000.0,
        fineWeightOz: 1000.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.05,
        defaultSellPremium: 0.0, // buy: 5%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: true,
      },
      {
        name: "Silver Bar 5kg",
        metalType: "silver" as const,
        category: "bar" as const,
        purity: 999.0,
        weightGrams: 5000.0,
        fineWeightGrams: 5000.0,
        fineWeightOz: 5000.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.04,
        defaultSellPremium: 0.0, // buy: 4%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },

      // ═══════════════════════════════════════════════════════════════
      // PLATINUM COINS
      // ═══════════════════════════════════════════════════════════════

      {
        name: "Platinum Maple Leaf 1 oz",
        metalType: "platinum" as const,
        category: "coin" as const,
        purity: 999.5,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.05,
        defaultSellPremium: 0.0, // buy: 5%
        country: "Canada",
        mint: "Royal Canadian Mint",
        year: "various",
        diameter: 30.0,
        thickness: 2.44,
        isPopular: true,
      },
      {
        name: "Platinum American Eagle 1 oz",
        metalType: "platinum" as const,
        category: "coin" as const,
        purity: 999.5,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.06,
        defaultSellPremium: 0.0, // buy: 6%
        country: "USA",
        mint: "US Mint",
        year: "various",
        diameter: 32.7,
        thickness: 2.39,
        isPopular: true,
      },
      {
        name: "Platinum Philharmonic 1 oz",
        metalType: "platinum" as const,
        category: "coin" as const,
        purity: 999.5,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.05,
        defaultSellPremium: 0.0, // buy: 5%
        country: "Austria",
        mint: "Austrian Mint",
        year: "various",
        diameter: 37.0,
        thickness: 2.0,
        isPopular: false,
      },

      // ═══════════════════════════════════════════════════════════════
      // PLATINUM BARS
      // ═══════════════════════════════════════════════════════════════

      {
        name: "Platinum Bar 1 oz",
        metalType: "platinum" as const,
        category: "bar" as const,
        purity: 999.5,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.04,
        defaultSellPremium: 0.0, // buy: 4%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: true,
      },
      {
        name: "Platinum Bar 10g",
        metalType: "platinum" as const,
        category: "bar" as const,
        purity: 999.5,
        weightGrams: 10.0,
        fineWeightGrams: 10.0,
        fineWeightOz: 10.0 / TROY_OUNCE_GRAMS,
        defaultBuyPremium: 0.07,
        defaultSellPremium: 0.0, // buy: 7%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: false,
      },

      // ═══════════════════════════════════════════════════════════════
      // PALLADIUM COINS
      // ═══════════════════════════════════════════════════════════════

      {
        name: "Palladium Maple Leaf 1 oz",
        metalType: "palladium" as const,
        category: "coin" as const,
        purity: 999.5,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.06,
        defaultSellPremium: 0.0, // buy: 6%
        country: "Canada",
        mint: "Royal Canadian Mint",
        year: "various",
        diameter: 30.0,
        thickness: 2.5,
        isPopular: true,
      },
      {
        name: "Palladium American Eagle 1 oz",
        metalType: "palladium" as const,
        category: "coin" as const,
        purity: 999.5,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.07,
        defaultSellPremium: 0.0, // buy: 7%
        country: "USA",
        mint: "US Mint",
        year: "various",
        diameter: 32.7,
        thickness: 2.39,
        isPopular: false,
      },

      // ═══════════════════════════════════════════════════════════════
      // PALLADIUM BARS
      // ═══════════════════════════════════════════════════════════════

      {
        name: "Palladium Bar 1 oz",
        metalType: "palladium" as const,
        category: "bar" as const,
        purity: 999.5,
        weightGrams: 31.1035,
        fineWeightGrams: 31.1035,
        fineWeightOz: 1.0,
        defaultBuyPremium: 0.05,
        defaultSellPremium: 0.0, // buy: 5%
        country: undefined,
        mint: undefined,
        year: undefined,
        diameter: undefined,
        thickness: undefined,
        isPopular: true,
      },
    ];

    // Insert all catalog items
    let insertedCount = 0;
    for (const item of catalogItems) {
      await ctx.db.insert("metalCatalog", item);
      insertedCount++;
    }

    console.log(`Seeded ${insertedCount} catalog items`);
    return { message: "Catalog seeded successfully", count: insertedCount };
  },
});

/**
 * Clear the catalog (for development/testing only)
 */
export const clearMetalCatalog = mutation({
  args: {},
  handler: async (ctx) => {
    const items = await ctx.db.query("metalCatalog").collect();
    for (const item of items) {
      await ctx.db.delete(item._id);
    }
    return { message: "Catalog cleared", count: items.length };
  },
});
