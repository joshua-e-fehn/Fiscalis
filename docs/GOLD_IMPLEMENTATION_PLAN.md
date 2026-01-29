# 🏦 Vault Implementation Plan

## Overview

This plan covers the complete implementation of the Precious Metals Vault feature, allowing users to track their gold, silver, platinum, and palladium holdings with real-time valuations.

### Goals

- Track all precious metal holdings (coins, bars, jewelry, scrap)
- Real-time valuation based on live spot prices
- Calculate profit/loss vs purchase price
- Beautiful, vault-themed UI with dark aesthetics
- Support for transaction history with backdated entries

### Premium Strategy

> **Note:** Initially, **placeholder premiums** will be used for the catalog items (estimated typical market premiums). These are approximations based on general market knowledge.
>
> In a later phase, **real premium markups** will be researched and added based on actual dealer pricing data. The system is designed to allow easy updates to premium values without affecting existing user holdings (users can also override premiums per item).

### New API

**Endpoint:** `https://www.gold.de/cache/api.json?_={timestamp}`

This API provides more comprehensive data than the current one:

- Prices per ounce, gram, and kilogram
- Purity-based prices (333, 585, 750, 833, 900, 916, 999)
- Multiple currencies (EUR, USD, CHF, GBP)
- Previous day prices for change calculation
- Exchange rates

---

## Phase 1: Backend - Update Price Tracking System ✅ COMPLETED

### Task 1.1: Update Supabase Database Schema ✅ COMPLETED

**File:** `backend/edge_functions/supabase/migrations/0004_vault_extended_prices.sql`

> ✅ **Implemented** - Migration created and applied manually via SQL Editor.

**Current schema (`precious_metal_prices` table):**

```sql
-- Existing columns (from migrations 0001-0003):
timestamp TIMESTAMP PRIMARY KEY
gold_eur NUMERIC(10, 2)      -- Gold price per ounce in EUR
gold_usd NUMERIC(10, 2)      -- Gold price per ounce in USD
silver_eur NUMERIC(10, 2)    -- Silver price per ounce in EUR
silver_usd NUMERIC(10, 2)    -- Silver price per ounce in USD
platinum_eur NUMERIC(10, 2)  -- Platinum price per ounce in EUR
platinum_usd NUMERIC(10, 2)  -- Platinum price per ounce in USD
palladium_eur NUMERIC(10, 2) -- Palladium price per ounce in EUR
palladium_usd NUMERIC(10, 2) -- Palladium price per ounce in USD
```

**New columns to add (backward compatible extension):**

```sql
-- Migration: Add CHF prices for all metals and extended gold prices

-- ============================================

-- CHF prices for all metals (per ounce)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS silver_chf NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS platinum_chf NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS palladium_chf NUMERIC(10, 2);

-- ============================================
-- Gold prices per gram (EUR, USD, CHF)
-- Note: Ounce price = gold_eur, gold_usd, gold_chf (already exists/added above)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_gram NUMERIC(12, 6);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_gram NUMERIC(12, 6);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_gram NUMERIC(12, 6);

-- ============================================
-- Gold prices per kilogram (EUR, USD, CHF)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_kilo NUMERIC(12, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_kilo NUMERIC(12, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_kilo NUMERIC(12, 2);

-- ============================================
-- Gold purity-based prices in EUR (price per gram at purity)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_333 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_585 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_750 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_833 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_900 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_916 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_eur_999 NUMERIC(10, 2);

-- ============================================
-- Gold purity-based prices in USD (price per gram at purity)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_333 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_585 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_750 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_833 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_900 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_916 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_usd_999 NUMERIC(10, 2);

-- ============================================
-- Gold purity-based prices in CHF (price per gram at purity)
-- ============================================
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_333 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_585 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_750 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_833 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_900 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_916 NUMERIC(10, 2);
ALTER TABLE precious_metal_prices ADD COLUMN IF NOT EXISTS gold_chf_999 NUMERIC(10, 2);
```

**Final schema summary after migration:**

| Column                                            | Type          | Description      |
| ------------------------------------------------- | ------------- | ---------------- |
| `timestamp`                                       | TIMESTAMP PK  | Record timestamp |
| **Base metal prices (per ounce)**                 |               |                  |
| `gold_eur`, `gold_usd`, `gold_chf`                | NUMERIC(10,2) | Gold per oz      |
| `silver_eur`, `silver_usd`, `silver_chf`          | NUMERIC(10,2) | Silver per oz    |
| `platinum_eur`, `platinum_usd`, `platinum_chf`    | NUMERIC(10,2) | Platinum per oz  |
| `palladium_eur`, `palladium_usd`, `palladium_chf` | NUMERIC(10,2) | Palladium per oz |
| **Gold per gram**                                 |               |                  |
| `gold_eur_gram`, `gold_usd_gram`, `gold_chf_gram` | NUMERIC(12,6) | Gold per gram    |
| **Gold per kilogram**                             |               |                  |
| `gold_eur_kilo`, `gold_usd_kilo`, `gold_chf_kilo` | NUMERIC(12,2) | Gold per kg      |
| **Gold purity prices (EUR)**                      |               |                  |
| `gold_eur_333` ... `gold_eur_999`                 | NUMERIC(10,2) | 7 purity levels  |
| **Gold purity prices (USD)**                      |               |                  |
| `gold_usd_333` ... `gold_usd_999`                 | NUMERIC(10,2) | 7 purity levels  |
| **Gold purity prices (CHF)**                      |               |                  |
| `gold_chf_333` ... `gold_chf_999`                 | NUMERIC(10,2) | 7 purity levels  |

> **Note:** Previous day prices are NOT stored since prices are tracked every minute. Historical comparison can be done by querying past records directly.

**Estimated time:** 30 minutes

---

### Task 1.2: Update Edge Function for New API

**File:** `backend/edge_functions/supabase/functions/fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate/index.ts`

**Changes:**

1. Switch API endpoint from `metalle-intraday.php` to `cache/api.json`
2. Remove string parsing (new API returns numbers directly with `_o` suffix)
3. Extract all new data points (gram, kilo, purity prices in EUR/USD/CHF)
4. Update database insert to include all new columns

**Key API field mappings:**

| API Field                    | DB Column         | Description                                                                                |
| ---------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| **Base Ounce Prices**        |                   |                                                                                            |
| `au_gold_eur_o`              | `gold_eur`        | Gold EUR/oz                                                                                |
| `au_gold_usd_o`              | `gold_usd`        | Gold USD/oz                                                                                |
| `au_gold_chf_o`              | `gold_chf`        | Gold CHF/oz                                                                                |
| `au_silber_eur_o`            | `silver_eur`      | Silver EUR/oz                                                                              |
| `au_silber_usd_o`            | `silver_usd`      | Silver USD/oz                                                                              |
| `au_silber_chf_o`            | `silver_chf`      | Silver CHF/oz                                                                              |
| `au_platin_eur_o`            | `platinum_eur`    | Platinum EUR/oz                                                                            |
| `au_platin_usd_o`            | `platinum_usd`    | Platinum USD/oz                                                                            |
| `au_platin_chf_o`            | `platinum_chf`    | Platinum CHF/oz                                                                            |
| `au_palladium_eur_o`         | `palladium_eur`   | Palladium EUR/oz                                                                           |
| `au_palladium_usd_o`         | `palladium_usd`   | Palladium USD/oz                                                                           |
| `au_palladium_chf_o`         | `palladium_chf`   | Palladium CHF/oz                                                                           |
| **Gold per Gram**            |                   |                                                                                            |
| `au_gold_eur_o_gramm`        | `gold_eur_gram`   | Gold EUR/gram                                                                              |
| `au_gold_usd_o_gramm`        | `gold_usd_gram`   | Gold USD/gram                                                                              |
| `au_gold_chf_o_gramm`        | `gold_chf_gram`   | Gold CHF/gram                                                                              |
| **Gold per Kilo**            |                   |                                                                                            |
| `au_gold_eur_o_kilo`         | `gold_eur_kilo`   | Gold EUR/kilo                                                                              |
| `au_gold_usd_o_kilo`         | `gold_usd_kilo`   | Gold USD/kilo                                                                              |
| `au_gold_chf_o_kilo`         | `gold_chf_kilo`   | Gold CHF/kilo                                                                              |
| **Gold Purity Prices (EUR)** |                   |                                                                                            |
| `au_gold_eur_o_333`          | `gold_eur_333`    | 8 karat                                                                                    |
| `au_gold_eur_o_585`          | `gold_eur_585`    | 14 karat                                                                                   |
| `au_gold_eur_o_750`          | `gold_eur_750`    | 18 karat                                                                                   |
| `au_gold_eur_o_833`          | `gold_eur_833`    | 20 karat                                                                                   |
| `au_gold_eur_o_900`          | `gold_eur_900`    | 21.6 karat                                                                                 |
| `au_gold_eur_o_916`          | `gold_eur_916`    | 22 karat                                                                                   |
| `au_gold_eur_o_999`          | `gold_eur_999`    | 24 karat                                                                                   |
| **Gold Purity Prices (USD)** |                   |                                                                                            |
| `au_gold_usd_o_333`          | `gold_usd_333`    | 8 karat                                                                                    |
| `au_gold_usd_o_585`          | `gold_usd_585`    | 14 karat                                                                                   |
| `au_gold_usd_o_750`          | `gold_usd_750`    | 18 karat                                                                                   |
| `au_gold_usd_o_833`          | `gold_usd_833`    | 20 karat                                                                                   |
| `au_gold_usd_o_900`          | `gold_usd_900`    | 21.6 karat                                                                                 |
| `au_gold_usd_o_916`          | `gold_usd_916`    | 22 karat                                                                                   |
| `au_gold_usd_o_999`          | `gold_usd_999`    | 24 karat                                                                                   |
| **Gold Purity Prices (CHF)** |                   |                                                                                            |
| `au_gold_chf_o_333`          | `gold_chf_333`    | 8 karat                                                                                    |
| `au_gold_chf_o_585`          | `gold_chf_585`    | 14 karat                                                                                   |
| `au_gold_chf_o_750`          | `gold_chf_750`    | 18 karat                                                                                   |
| `au_gold_chf_o_833`          | `gold_chf_833`    | 20 karat                                                                                   |
| `au_gold_chf_o_900`          | `gold_chf_900`    | 21.6 karat                                                                                 |
| `au_gold_chf_o_916`          | `gold_chf_916`    | 22 karat                                                                                   |
| `au_gold_chf_o_999`          | `gold_chf_999`    | 24 karat                                                                                   |
| **Other**                    |                   |                                                                                            |
| `feinunze_gramm`             | -                 | Troy oz in grams (31.1034768) - hardcoded as constant in `convex/lib/priceCalculations.ts` |
| `au_wechselkurs_eur_usd`     | `from_eur_to_usd` | EUR→USD exchange rate                                                                      |
| `au_wechselkurs_eur_chf`     | `from_eur_to_chf` | EUR→CHF exchange rate                                                                      |

**Estimated time:** ~~1 hour~~ ✅ Done

---

### Task 1.2: Update Edge Function for New API ✅ COMPLETED

**File:** `backend/edge_functions/supabase/functions/fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate/index.ts`

> ✅ **Implemented & Deployed** - Edge function updated and deployed via `supabase functions deploy`. Cron job confirmed running successfully.

**Changes made:**

- ✅ Switched to new API: `https://www.gold.de/cache/api.json`
- ✅ Removed string parsing (API returns numbers directly)
- ✅ Saves all CHF prices for all metals
- ✅ Saves gold gram/kilo prices
- ✅ Saves all 21 purity-based prices (7 × 3 currencies)
- ✅ Saves EUR→CHF exchange rate

---

## Phase 2: Convex Schema & Backend ✅ COMPLETED

### Task 2.1: Create Vault Schema in Convex ✅ COMPLETED

**File:** `frontend/convex/schema.ts`

> ✅ **Implemented** - Schema added with `metalCatalog`, `vaultItems`, and `vaultTransactions` tables.

**Tables added:**

```typescript
// Metal catalog - predefined coins/bars with default premiums
metalCatalog: defineTable({
  name: v.string(), // "Krugerrand 1 oz"
  metalType: v.string(), // "gold" | "silver" | "platinum" | "palladium"
  category: v.string(), // "coin" | "bar"
  purity: v.number(), // 999.9, 916.7, etc.
  weightGrams: v.number(), // Total weight
  fineWeightGrams: v.number(), // Pure metal content
  fineWeightOz: v.number(), // Pure metal in troy ounces
  defaultPremium: v.number(), // 0.03 = 3%
  country: v.optional(v.string()), // "South Africa"
  mintYear: v.optional(v.string()), // "various" or specific year
  diameter: v.optional(v.number()), // mm
  thickness: v.optional(v.number()), // mm
  imageUrl: v.optional(v.string()),
  isPopular: v.boolean(),
})
  .index("by_metal", ["metalType"])
  .index("by_category", ["category"])
  .index("by_popular", ["isPopular"]);

// User's vault items
vaultItems: defineTable({
  userId: v.string(),

  // Item identification
  catalogItemId: v.optional(v.id("metalCatalog")), // If from catalog
  customName: v.optional(v.string()), // If custom item

  // Metal details
  metalType: v.string(), // "gold" | "silver" | "platinum" | "palladium"
  category: v.string(), // "coin" | "bar" | "jewelry" | "scrap"
  purity: v.number(), // Fineness (e.g., 999.9, 916.7)
  weightGrams: v.number(), // Total weight in grams
  fineWeightGrams: v.number(), // Pure metal weight in grams

  // Holdings
  quantity: v.number(),
  premium: v.number(), // Applied premium (can override catalog default)

  // Purchase info
  purchasePricePerUnit: v.optional(v.number()),
  purchaseDate: v.optional(v.string()), // ISO date string - allows backdated entries
  purchaseCurrency: v.optional(v.string()),

  // Storage & notes
  storageLocation: v.optional(v.string()),
  notes: v.optional(v.string()),

  // Images (Phase 6)
  itemImageUrl: v.optional(v.string()),
  invoiceImageUrl: v.optional(v.string()),
})
  .index("by_user", ["userId"])
  .index("by_user_metal", ["userId", "metalType"]);

// Transaction history - allows backdated entries
vaultTransactions: defineTable({
  userId: v.string(),
  vaultItemId: v.id("vaultItems"),

  transactionType: v.string(), // "buy" | "sell" | "gift_received" | "gift_given"
  quantity: v.number(),
  pricePerUnit: v.number(),
  currency: v.string(), // "EUR" | "USD" | "CHF"
  transactionDate: v.string(), // ISO date string - can be any past date

  // Spot price at transaction time (for accurate P/L calculation)
  spotPriceAtTransaction: v.optional(v.number()),

  notes: v.optional(v.string()),
  invoiceImageUrl: v.optional(v.string()),
})
  .index("by_user", ["userId"])
  .index("by_item", ["vaultItemId"])
  .index("by_date", ["userId", "transactionDate"]);
```

**Estimated time:** ~~45 minutes~~ ✅ Done

---

### Task 2.2: Create Convex Functions for Vault ✅ COMPLETED

**File:** `frontend/convex/vault.ts`

> ✅ **Implemented** - All queries and mutations created.

**Queries implemented:**

```typescript
// Get all catalog items, optionally filtered
export const getMetalCatalog = query({
  args: {
    metalType: v.optional(v.string()),
    category: v.optional(v.string())
  },
  handler: async (ctx, args) => { ... }
});

// Get popular catalog items for quick-add
export const getPopularCatalogItems = query({
  args: {},
  handler: async (ctx) => { ... }
});

// Get all vault items for a user
export const getUserVaultItems = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => { ... }
});

// Get aggregated summary by metal type
export const getUserVaultSummary = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => { ... }
});

// Get transaction history for an item
export const getVaultItemTransactions = query({
  args: { vaultItemId: v.id("vaultItems") },
  handler: async (ctx, args) => { ... }
});

// Get all transactions for a user (for history page)
export const getUserTransactions = query({
  args: {
    userId: v.string(),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => { ... }
});
```

**Mutations to implement:**

```typescript
// Add item from catalog
export const addVaultItemFromCatalog = mutation({
  args: {
    userId: v.string(),
    catalogItemId: v.id("metalCatalog"),
    quantity: v.number(),
    premium: v.optional(v.number()),           // Override default premium
    purchasePricePerUnit: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),      // Allows backdated entries
    purchaseCurrency: v.optional(v.string()),
    storageLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => { ... }
});

// Add custom item
export const addCustomVaultItem = mutation({
  args: {
    userId: v.string(),
    customName: v.string(),
    metalType: v.string(),
    category: v.string(),
    purity: v.number(),
    weightGrams: v.number(),
    quantity: v.number(),
    premium: v.number(),
    purchasePricePerUnit: v.optional(v.number()),
    purchaseDate: v.optional(v.string()),
    purchaseCurrency: v.optional(v.string()),
    storageLocation: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => { ... }
});

// Update vault item
export const updateVaultItem = mutation({
  args: {
    itemId: v.id("vaultItems"),
    updates: v.object({ ... })
  },
  handler: async (ctx, args) => { ... }
});

// Delete vault item
export const deleteVaultItem = mutation({
  args: { itemId: v.id("vaultItems") },
  handler: async (ctx, args) => { ... }
});

// Add transaction (supports backdated entries)
export const addTransaction = mutation({
  args: {
    userId: v.string(),
    vaultItemId: v.id("vaultItems"),
    transactionType: v.string(),
    quantity: v.number(),
    pricePerUnit: v.number(),
    currency: v.string(),
    transactionDate: v.string(),           // Any past date allowed
    spotPriceAtTransaction: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => { ... }
});
```

**Estimated time:** ~~2 hours~~ ✅ Done

---

### Task 2.3: Seed Metal Catalog Data ✅ COMPLETED

**File:** `frontend/convex/seedCatalog.ts`

> ✅ **Implemented** - Comprehensive catalog with 60+ items across all four metal types (gold, silver, platinum, palladium), including coins and bars.

> ⚠️ **Placeholder Premiums:** The premiums listed below are **estimates** based on typical market ranges. They will be refined with real dealer data in a future update. Users can override these per-item when adding to their vault.

**Items seeded:**

- Gold coins: Krugerrand (1oz, 1/2oz, 1/4oz, 1/10oz), Maple Leaf (4 sizes), American Eagle (4 sizes), Philharmonic, Britannia, Kangaroo, Chinese Panda
- Gold bars: 1g, 2g, 5g, 10g, 20g, 1oz, 50g, 100g, 250g, 500g, 1kg
- Silver coins: Maple Leaf, American Eagle, Philharmonic, Britannia, Kangaroo
- Silver bars: 1oz, 100g, 250g, 500g, 1kg, 5kg
- Platinum coins: Maple Leaf, American Eagle, Philharmonic
- Platinum bars: 1oz, 10g, 50g, 100g
- Palladium coins: Maple Leaf
- Palladium bars: 1oz

**Usage:** Run `seedMetalCatalog` mutation once from Convex dashboard to populate the catalog.

**Estimated time:** ~~1.5 hours~~ ✅ Done

---

### Task 2.4: Create Price Calculation Utilities ✅ COMPLETED

**File:** `frontend/convex/lib/priceCalculations.ts`

> ✅ **Implemented** - The troy ounce constant (`TROY_OUNCE_GRAMS = 31.1034768`) is hardcoded as a physical constant rather than stored in a database table.

**Implemented functions:**

- `TROY_OUNCE_GRAMS` - Constant (31.1034768)
- `gramsToTroyOunces()` - Weight conversion
- `troyOuncesToGrams()` - Weight conversion
- `calculateFineWeight()` - Calculate pure metal weight from total weight and purity
- `calculateMarketValue()` - Value with premium
- `calculateMeltValue()` - Pure metal value without premium
- `calculatePremiumValue()` - Premium portion of value
- `calculateProfitLoss()` - P/L calculation
- `calculatePriceChange()` - Price change calculation
- `formatCurrency()` - Currency formatting utility
- `formatWeight()` - Weight formatting utility
- `formatPercentage()` - Percentage formatting utility

**Estimated time:** ~~30 minutes~~ ✅ Done

---

## Phase 3: Frontend - Price Hook & API Integration ✅ COMPLETED

> **Important:** All metal prices are fetched from **Supabase** (PostgreSQL) via the existing Hono API routes. The edge function writes prices every minute to the `precious_metal_prices` table, and the frontend queries this data. This ensures consistent, server-cached pricing with proper time-series data for historical comparisons.

### Task 3.1: Extend Metal Prices API ✅ COMPLETED

**Files:**

- `frontend/app/(api)/api/[[...route]]/metals.ts` - Extended with new endpoints
- `frontend/lib/types/metals.ts` - Added CHF currency support
- `frontend/db/drizzle/schema.ts` - Added new columns for extended prices

**Data Source:** Supabase `precious_metal_prices` table (updated every minute by cron job)

**API Endpoints:**

| Endpoint                                           | Description                                 |
| -------------------------------------------------- | ------------------------------------------- |
| `GET /:metal/prices/latest?currency=eur\|usd\|chf` | Single metal price (existing, now with CHF) |
| `GET /gold/prices/extended`                        | Gold gram/kilo/purity prices                |
| `GET /prices/all/latest`                           | All 4 metals + exchange rates               |

**Response Types:**

```typescript
// GET /prices/all/latest
interface AllMetalPrices {
  gold: { eur: number; usd: number; chf: number | null; };
  silver: { eur: number; usd: number; chf: number | null; };
  platinum: { eur: number; usd: number; chf: number | null; };
  palladium: { eur: number; usd: number; chf: number | null; };
  exchangeRates: { eurToUsd: number | null; eurToChf: number | null; };
  timestamp: string;
}

// GET /gold/prices/extended
interface GoldExtendedPrices {
  ounce: { eur: number; usd: number; chf: number | null; };
  gram: { eur: number | null; usd: number | null; chf: number | null; };
  kilo: { eur: number | null; usd: number | null; chf: number | null; };
  purity: {
    eur: { 333: number | null; 585: number | null; ... 999: number | null; };
    usd: { 333: number | null; 585: number | null; ... 999: number | null; };
    chf: { 333: number | null; 585: number | null; ... 999: number | null; };
  };
  timestamp: string;
}
```

**Estimated time:** ~~1.5 hours~~ ✅ Done

---

### Task 3.2: Create Metals Hooks ✅ COMPLETED

**Files:**

- `frontend/hooks/metals.ts` - All price hooks (merged)
- `frontend/hooks/convex/metals.ts` - Metals data hooks (Convex + Supabase)
- `frontend/lib/types/metals-extended.ts` - Type definitions
- `frontend/lib/api/metals.ts` - API functions (merged)

**Hooks implemented:**

```typescript
// Price hooks (from Supabase) - in hooks/metals.ts
useAllMetalPrices(); // GET /api/metals/prices/all/latest
useGoldExtendedPrices(); // GET /api/metals/gold/prices/extended
useMetalsPrices(); // Combined: all metals + gold extended
getSpotPrice(); // Helper: get spot price for metal/currency
getGoldPurityPrice(); // Helper: get gold purity price

// Metals data hooks (Convex + Supabase prices) - in hooks/convex/metals.ts
useMetals(userId, currency); // Items with live valuations
useMetalsSummary(userId, currency); // Portfolio totals & allocation
useMetalItem(itemId, currency); // Single item detail

// Mutation hooks (Convex) - in hooks/convex/metals.ts
useAddMetalItemFromCatalog();
useAddCustomMetalItem();
useUpdateMetalItem();
useDeleteMetalItem();
useAddMetalTransaction();
useDeleteMetalTransaction();
```

**Types defined (in lib/types/metals-extended.ts):**

```typescript
MetalsCurrency; // "eur" | "usd" | "chf"
MetalsType; // "gold" | "silver" | "platinum" | "palladium"
MetalsPrices; // Combined prices (all metals + gold extended)
MetalItemWithValuation; // Item with computed valuations
MetalsSummary; // Portfolio totals by metal
MetalSummary; // Single metal breakdown
GoldExtendedPrices; // Gold gram/kilo/purity prices
AllMetalPrices; // All 4 metals base prices
```

**Estimated time:** ~~1.5 hours~~ ✅ Done

---

## Phase 4: Frontend - Precious Metals Inventory UI (REVISED) ✅ COMPLETED

> **Design Decisions:**
>
> - Single-page app feel with sidebar navigation
> - Slide-over panels for add/edit/detail (no separate pages)
> - Bento grid layout for dashboard
> - Multiple view options for holdings (table, cards, grouped)
> - Light theme with metallic accents (no dark theme yet)
> - Desktop-first (mobile ignored for now)
> - Easy navigation between price charts and inventory

### ✅ Implementation Notes

**Simplified component structure:** Instead of creating many small components, we consolidated into fewer, more complete components:

**Actual files created:**

```
frontend/components/atomic/
├── atoms/metals/
│   ├── MetalBadge.tsx           # Colored metal type badge
│   ├── PriceDisplay.tsx         # Formatted currency with optional change
│   ├── ChangeIndicator.tsx      # +/- percentage with color
│   ├── WeightDisplay.tsx        # Weight with unit (g, oz, kg)
│   ├── PurityBadge.tsx          # Purity indicator (999.9, 916.7, etc.)
│   └── index.ts                 # Barrel exports
│
├── molecules/metals/
│   ├── TotalValueCard.tsx       # Total value + daily change
│   ├── TotalProfitLossCard.tsx  # P/L summary + best performer
│   ├── MetalAllocationBar.tsx   # Horizontal segmented bar
│   ├── MetalSummaryCard.tsx     # Per-metal breakdown
│   ├── AllocationChart.tsx      # Pie chart using Recharts
│   ├── SpotPricesTicker.tsx     # Live spot prices
│   ├── EmptyVaultState.tsx      # Empty state with CTAs
│   ├── HoldingsToolbar.tsx      # Search, filters, view toggle
│   ├── HoldingCard.tsx          # Single item card
│   ├── HoldingsTable.tsx        # Table view
│   ├── HoldingsCardGrid.tsx     # Card grid view
│   ├── HoldingsGroupedView.tsx  # Grouped by metal view
│   └── index.ts                 # Barrel exports
│
└── organisms/metals/
    ├── MetalsInventoryPage.tsx  # Main page with tabs
    ├── AddMetalSlideOver.tsx    # Add item slide-over
    └── MetalDetailSlideOver.tsx # Item detail slide-over

frontend/app/(root)/commodities/metals/inventory/
└── page.tsx                     # Route page
```

**Key implementation decisions:**

- Used Shadcn Sheet for slide-overs (simpler than custom implementation)
- Combined catalog browser + custom form in AddMetalSlideOver with internal tabs
- Empty state shows beneath dashboard cards (not replacing them)
- Used Recharts for pie chart
- Integrated with existing Convex mutations (addVaultItemFromCatalog, addCustomVaultItem, deleteVaultItem)

---

### Task 4.1: Page Structure & Navigation ✅ COMPLETED

**Location:** `/commodities/metals/inventory`

**Layout Structure:**

```
┌──────────────────────────────────────────────────────────────────┐
│  Precious Metals Inventory                    [View Prices →]    │
├──────────┬───────────────────────────────────────────────────────┤
│          │                                                       │
│ Overview │  [Main content area - changes based on tab]           │
│ Holdings │                                                       │
│ History  │                                                       │
│          │                                                       │
│ ──────── │                                                       │
│ + Add    │                                                       │
│          │                                                       │
└──────────┴───────────────────────────────────────────────────────┘
```

**Files to create:**

```
frontend/app/(root)/commodities/metals/inventory/
└── page.tsx                    # Single page with tabbed navigation

frontend/components/atomic/organisms/metals/
├── MetalsInventoryPage.tsx     # Main orchestrator component
├── MetalsOverviewTab.tsx       # Overview/dashboard content
├── MetalsHoldingsTab.tsx       # Holdings list with views
├── MetalsHistoryTab.tsx        # Transaction history
├── AddMetalSlideOver.tsx       # Slide-over for adding items
├── MetalDetailSlideOver.tsx    # Slide-over for item details
└── EditMetalSlideOver.tsx      # Slide-over for editing items
```

**Estimated time:** ~~1 hour~~ ✅ Done

---

### Task 4.2: Bento Grid Dashboard (Overview Tab) ✅ COMPLETED

**Layout:**

```
┌─────────────────────┬─────────────────────┬─────────────────────────┐
│ TOTAL VALUE         │ TOTAL P/L           │ ALLOCATION              │
│ €127,453.80         │ +€12,341.20 (+10.7%)│ [Pie/Donut Chart]       │
│ 📈 +€234.50 today   │ ✨ Best: Gold +15%  │                         │
├─────────────────────┴─────────────────────┴─────────────────────────┤
│ Gold €108k ████████████  Silver €12k ██  Platinum €6k █  Pall €0   │
├─────────────┬─────────────┬─────────────┬───────────────────────────┤
│ 🥇 GOLD     │ 🥈 SILVER   │ ⚪ PLATINUM │ ⚫ PALLADIUM              │
│ €108,335.73 │ €12,745.38  │ €6,372.69   │ €0.00                    │
│ 25.12 oz    │ 137.03 oz   │ 2.89 oz     │ 0 oz                     │
│ +12.5% P/L  │ +8.2% P/L   │ -2.1% P/L   │ --                       │
├─────────────┴─────────────┴─────────────┴───────────────────────────┤
│ LIVE SPOT PRICES                              Last update: 2s ago  │
│ Gold: €2,650.80/oz (+0.12%)  │  Silver: €31.07/oz (-0.05%)         │
│ Platinum: €985.20/oz (+0.08%)│  Palladium: €1,023.50/oz (+0.15%)   │
├─────────────────────────────────────────────────────────────────────┤
│ PORTFOLIO VALUE OVER TIME                           [1W] [1M] [1Y] │
│ [Line Chart showing portfolio value history]                        │
└─────────────────────────────────────────────────────────────────────┘
```

**Components:**

```
frontend/components/atomic/molecules/metals/
├── TotalValueCard.tsx          # Total portfolio value with daily change
├── TotalProfitLossCard.tsx     # P/L summary with best performer
├── AllocationChart.tsx         # Pie/donut chart for allocation
├── MetalAllocationBar.tsx      # Horizontal segmented bar
├── MetalSummaryCard.tsx        # Per-metal breakdown card
├── SpotPricesTicker.tsx        # Live prices with change indicators
└── PortfolioChart.tsx          # Historical portfolio value chart
```

**Estimated time:** ~~3 hours~~ ✅ Done

---

### Task 4.3: Holdings Tab with Multiple Views ✅ COMPLETED

**Features:**

- View toggle: `[Table] [Cards] [Grouped]`
- Search bar with real-time filtering
- Sort options: Value, P/L %, Quantity, Date Added, Name
- Filter by: Metal type, Category (coin/bar/jewelry/scrap)

**Table View:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🔍 Search...          [All Metals ▼] [All Types ▼]  Sort: [Value ▼] │
│                                                  [Table] [Cards] [Grouped] │
├──────────────────────────────────────────────────────────────────────┤
│ Item                  │ Qty │ Weight   │ Value      │ P/L           │
├───────────────────────┼─────┼──────────┼────────────┼───────────────┤
│ 🥇 Krugerrand 1 oz    │  3  │ 93.31g   │ €12,994.14 │ +€2,494 (+23%)│
│ 🥇 Gold Bar 100g      │  1  │ 100.00g  │ €8,542.30  │ +€1,542 (+22%)│
│ 🥈 Maple Leaf 1 oz    │  10 │ 311.03g  │ €982.40    │ +€82 (+9%)    │
│ 🥈 Silver Bar 1kg     │  2  │ 2000.00g │ €1,987.60  │ -€12 (-0.6%)  │
└──────────────────────────────────────────────────────────────────────┘
```

**Card View:**

```
┌─────────────────────┐ ┌─────────────────────┐ ┌─────────────────────┐
│ 🥇 Krugerrand 1 oz  │ │ 🥇 Gold Bar 100g    │ │ 🥈 Maple Leaf 1 oz  │
│ Qty: 3              │ │ Qty: 1              │ │ Qty: 10             │
│ 916.7 purity        │ │ 999.9 purity        │ │ 999.9 purity        │
│ ─────────────────── │ │ ─────────────────── │ │ ─────────────────── │
│ €12,994.14          │ │ €8,542.30           │ │ €982.40             │
│ +€2,494.14 (+23.7%) │ │ +€1,542.30 (+22.0%) │ │ +€82.40 (+9.2%)     │
└─────────────────────┘ └─────────────────────┘ └─────────────────────┘
```

**Grouped View:**

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🥇 GOLD (4 items)                                        €21,536.44 │
├──────────────────────────────────────────────────────────────────────┤
│   Krugerrand 1 oz (x3)     │ 93.31g  │ €12,994.14 │ +23.7%          │
│   Gold Bar 100g            │ 100.00g │ €8,542.30  │ +22.0%          │
├──────────────────────────────────────────────────────────────────────┤
│ 🥈 SILVER (2 items)                                       €2,970.00 │
├──────────────────────────────────────────────────────────────────────┤
│   Maple Leaf 1 oz (x10)    │ 311.03g │ €982.40    │ +9.2%           │
│   Silver Bar 1kg (x2)      │ 2000.0g │ €1,987.60  │ -0.6%           │
└──────────────────────────────────────────────────────────────────────┘
```

**Components:**

```
frontend/components/atomic/molecules/metals/
├── HoldingsToolbar.tsx         # Search, filters, sort, view toggle
├── HoldingsTable.tsx           # Table view component
├── HoldingsCardGrid.tsx        # Card grid view component
├── HoldingsGroupedList.tsx     # Grouped by metal view
├── HoldingTableRow.tsx         # Single row in table
├── HoldingCard.tsx             # Single card in grid
└── HoldingGroupItem.tsx        # Item in grouped list
```

**Estimated time:** ~~4 hours~~ ✅ Done

---

### Task 4.4: Add Item Slide-Over Panel ✅ COMPLETED

**Trigger:** "+ Add" button in sidebar or empty state

**Structure:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Add to Inventory                                           [×]  │
├─────────────────────────────────────────────────────────────────┤
│ [From Catalog]  [Custom Item]                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  QUICK ADD (Popular Items)                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐               │
│  │Kruger.  │ │Maple    │ │Gold Bar │ │Silver   │               │
│  │1 oz     │ │Leaf 1oz │ │100g     │ │Eagle 1oz│               │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘               │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  BROWSE CATALOG                                                 │
│  [Gold] [Silver] [Platinum] [Palladium]                        │
│  Filter: [All ▼]                            🔍 Search catalog  │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Krugerrand 1 oz        │ 31.10g fine │ ~3% premium     │   │
│  │ Krugerrand 1/2 oz      │ 15.55g fine │ ~4% premium     │   │
│  │ Krugerrand 1/4 oz      │ 7.78g fine  │ ~5% premium     │   │
│  │ American Eagle 1 oz    │ 31.10g fine │ ~4% premium     │   │
│  │ ...                                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**After selecting an item → Details form:**

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back                   Add Krugerrand 1 oz              [×]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  🥇 Krugerrand 1 oz                                            │
│  916.7 purity │ 33.93g total │ 31.10g fine                     │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Quantity *                                                     │
│  [ 1                                              ] [+] [-]     │
│                                                                 │
│  Purchase Price (per unit)           Currency                   │
│  [ €2,850.00                    ]    [ EUR ▼ ]                 │
│                                                                 │
│  Purchase Date                                                  │
│  [ 2024-06-15                   ]    📅                        │
│                                                                 │
│  Premium Override (optional)         Default: 3.5%              │
│  [ 3.5                          ] %                            │
│                                                                 │
│  Storage Location (optional)                                    │
│  [ Home safe                    ]                              │
│                                                                 │
│  Notes (optional)                                               │
│  [ Purchased from local dealer  ]                              │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Estimated Value: €2,950.00                                    │
│                                                                 │
│  [        Add to Inventory        ]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Custom Item Tab:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Add to Inventory                                           [×]  │
├─────────────────────────────────────────────────────────────────┤
│ [From Catalog]  [Custom Item]  ← Selected                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Item Name *                                                    │
│  [ Grandma's Gold Ring              ]                          │
│                                                                 │
│  Metal Type *                        Category *                 │
│  [ Gold ▼ ]                          [ Jewelry ▼ ]             │
│                                                                 │
│  Purity *                                                       │
│  [ 750 (18k) ▼ ] or custom: [     ]                            │
│                                                                 │
│  Total Weight (grams) *              Quantity *                 │
│  [ 5.5                       ]       [ 1         ]             │
│                                                                 │
│  Fine Weight: 4.125g (calculated)                              │
│                                                                 │
│  Premium %                                                      │
│  [ 0                         ] %                               │
│                                                                 │
│  Purchase Price (per unit)           Currency                   │
│  [ €150.00                   ]       [ EUR ▼ ]                 │
│                                                                 │
│  Purchase Date                                                  │
│  [ 2020-01-01                ]       📅                        │
│                                                                 │
│  Storage Location                    Notes                      │
│  [ Jewelry box               ]       [ Family heirloom ]       │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  Melt Value: €165.00                                           │
│                                                                 │
│  [        Add to Inventory        ]                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Smart Defaults:**

- Purchase date defaults to today
- Currency defaults to EUR (or user's last used)
- Storage location suggests from previous entries
- Premium auto-fills from catalog default

**Components:**

```
frontend/components/atomic/organisms/metals/
├── AddMetalSlideOver.tsx       # Main slide-over container
├── CatalogTab.tsx              # Catalog browser content
├── CustomItemTab.tsx           # Custom item form
├── QuickAddGrid.tsx            # Popular items grid
├── CatalogItemList.tsx         # Scrollable catalog list
├── AddItemDetailsForm.tsx      # Details form after selection
└── CustomItemForm.tsx          # Full custom item form
```

**Implementation note:** Combined into single `AddMetalSlideOver.tsx` with internal tabs for catalog/custom.

**Estimated time:** ~~4 hours~~ ✅ Done

---

### Task 4.5: Item Detail Slide-Over Panel ✅ COMPLETED

**Trigger:** Click on any holding item

```
┌─────────────────────────────────────────────────────────────────┐
│ Krugerrand 1 oz                                   [Edit] [×]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     [Coin Image]                         │   │
│  │                    (placeholder)                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  🥇 Gold Coin │ South Africa │ 916.7 Purity                    │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  VALUATION                                                      │
│  ┌───────────────────┬───────────────────┬──────────────────┐  │
│  │ Market Value      │ Melt Value        │ Premium          │  │
│  │ €12,994.14        │ €12,559.46        │ €434.68 (3.5%)   │  │
│  └───────────────────┴───────────────────┴──────────────────┘  │
│                                                                 │
│  PROFIT / LOSS                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Cost Basis: €10,500.00                                    │  │
│  │ Current Value: €12,994.14                                 │  │
│  │ ─────────────────────────────────────────────────────────│  │
│  │ P/L: +€2,494.14 (+23.75%) ✨                              │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  SPECIFICATIONS                                                 │
│  Quantity: 3                                                    │
│  Weight per unit: 33.93g                                        │
│  Total weight: 101.79g                                          │
│  Fine weight per unit: 31.10g (1.0 oz)                         │
│  Total fine weight: 93.31g (3.0 oz)                            │
│  Diameter: 32.77mm │ Thickness: 2.84mm                         │
│                                                                 │
│  PURCHASE INFO                                                  │
│  Date: June 15, 2024                                           │
│  Price: €3,500.00 per unit                                     │
│  Currency: EUR                                                  │
│  Storage: Home safe                                             │
│  Notes: Purchased from local dealer                            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  TRANSACTION HISTORY                                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ Jun 15, 2024  │ BUY  │ +3 units │ €3,500/unit │ €10,500  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  [+ Add Transaction]                                            │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [        Delete Item        ]   (danger zone)                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**

```
frontend/components/atomic/molecules/metals/
├── ItemDetailHeader.tsx        # Image, name, badges
├── ValuationCard.tsx           # Market/melt/premium values
├── ProfitLossCard.tsx          # P/L calculation display
├── SpecificationsCard.tsx      # Weight, purity, dimensions
├── PurchaseInfoCard.tsx        # Date, price, location, notes
├── TransactionMiniList.tsx     # Compact transaction history
└── AddTransactionDialog.tsx    # Dialog for adding transactions
```

**Implementation note:** Combined into single `MetalDetailSlideOver.tsx` with all sections inline.

**Estimated time:** ~~3 hours~~ ✅ Done

---

### Task 4.6: History Tab ✅ COMPLETED

**Full transaction history with filtering and export:**

```
┌─────────────────────────────────────────────────────────────────┐
│ Transaction History                                             │
├─────────────────────────────────────────────────────────────────┤
│ 🔍 Search...   [All Items ▼] [All Types ▼] [Date Range 📅]     │
│                                              [Export CSV 📥]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ JANUARY 2026                                                    │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Jan 15 │ BUY   │ Krugerrand 1 oz (x2) │ €7,000  │ €3,500/u │ │
│ │ Jan 10 │ SELL  │ Silver Bar 500g      │ €450    │ €450/u   │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ DECEMBER 2025                                                   │
│ ┌────────────────────────────────────────────────────────────┐ │
│ │ Dec 20 │ BUY   │ Gold Bar 100g        │ €7,200  │ €7,200/u │ │
│ │ Dec 5  │ BUY   │ Maple Leaf 1 oz (x5) │ €475    │ €95/u    │ │
│ └────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ─────────────────────────────────────────────────────────────── │
│                                                                 │
│ SUMMARY                                                         │
│ Total Bought: €25,125.00 (15 transactions)                     │
│ Total Sold: €450.00 (1 transaction)                            │
│ Net Investment: €24,675.00                                     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Export Features:**

- CSV export with all fields
- ~~Date range selection~~ (deferred)
- Filter by transaction type (buy/sell)
- Summary statistics

**Implemented components:**

```
frontend/components/atomic/molecules/metals/
├── TransactionFilters.tsx      # Search, type/metal filters
├── TransactionList.tsx         # Grouped by month
├── TransactionRow.tsx          # Single transaction display
└── TransactionSummary.tsx      # Totals at bottom

frontend/lib/utils/
└── export.ts                   # CSV export utility
```

**Implementation notes:**

- Added `useVaultTransactions` hook to fetch all user transactions
- TransactionFilters supports search, type filter, and metal filter
- TransactionList groups transactions by month with collapsible sections
- TransactionSummary shows total bought, total sold, and net investment
- CSV export includes all transaction details

**Estimated time:** ~~2.5 hours~~ ✅ Done

---

### Task 4.7: Empty State ✅ COMPLETED

**When user has no holdings:**

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│                          🪙                                     │
│                                                                 │
│              Your vault is empty                                │
│                                                                 │
│     Start building your precious metals portfolio               │
│     by adding your first item.                                  │
│                                                                 │
│     ┌─────────────────────────────────────────────┐            │
│     │         [+ Add from Catalog]                │            │
│     └─────────────────────────────────────────────┘            │
│     ┌─────────────────────────────────────────────┐            │
│     │         [+ Add Custom Item]                 │            │
│     └─────────────────────────────────────────────┘            │
│                                                                 │
│     ─────────────────────────────────────────────               │
│                                                                 │
│     Popular items to get started:                               │
│     ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│     │🥇       │ │🥇       │ │🥈       │ │🥇       │           │
│     │Kruger.  │ │Maple    │ │Silver   │ │Gold Bar │           │
│     │1 oz     │ │Leaf     │ │Eagle    │ │100g     │           │
│     └─────────┘ └─────────┘ └─────────┘ └─────────┘           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Component:**

```
frontend/components/atomic/molecules/metals/
└── EmptyVaultState.tsx         # Empty state with CTAs
```

**Implementation note:** Empty state shows beneath dashboard cards instead of replacing the entire page. Includes two CTA buttons that open the AddMetalSlideOver.

**Estimated time:** ~~30 minutes~~ ✅ Done

---

### Task 4.8: Real-Time Price Updates ✅ COMPLETED

**Features:**

- ~~Auto-refresh prices every 60 seconds~~ (handled by React Query)
- Visual indicator: "Prices updating..." with spinner ✅
- Animate value changes (number count animation) ✅
- Relative timestamp: "Last updated: 2s ago" ✅
- Manual refresh button ✅

**Implemented components:**

```
frontend/components/atomic/atoms/metals/
├── AnimatedNumber.tsx          # Smooth count up/down animation with easing
└── PriceUpdateIndicator.tsx    # "Updating..." spinner + relative time
```

**Implementation notes:**

- `AnimatedNumber` uses requestAnimationFrame for smooth 60fps animations
- Cubic ease-out for natural deceleration
- Color flash (green/red) during value transitions
- `PriceUpdateIndicator` auto-updates relative time every second
- TotalValueCard and SpotPricesTicker now use AnimatedNumber
- Prices auto-refresh via React Query's refetchInterval (from useMetalsPrices hook)

**Estimated time:** ~~1.5 hours~~ ✅ Done

---

## Phase 5: Styling & Theme ✅ COMPLETED

### Task 5.1: Metal Color System ✅ COMPLETED

**Color definitions (add to Tailwind config or CSS variables):**

```css
:root {
  /* Metal accent colors */
  --metal-gold: #ffd700;
  --metal-gold-muted: #c9a227;
  --metal-gold-bg: rgba(255, 215, 0, 0.1);
  --metal-gold-border: rgba(255, 215, 0, 0.3);

  --metal-silver: #c0c0c0;
  --metal-silver-muted: #a8a8a8;
  --metal-silver-bg: rgba(192, 192, 192, 0.1);
  --metal-silver-border: rgba(192, 192, 192, 0.3);

  --metal-platinum: #e5e4e2;
  --metal-platinum-muted: #d4d4d4;
  --metal-platinum-bg: rgba(229, 228, 226, 0.1);
  --metal-platinum-border: rgba(229, 228, 226, 0.3);

  --metal-palladium: #ced0ce;
  --metal-palladium-muted: #b8bab8;
  --metal-palladium-bg: rgba(206, 208, 206, 0.1);
  --metal-palladium-border: rgba(206, 208, 206, 0.3);

  /* P/L colors */
  --profit: #22c55e;
  --profit-bg: rgba(34, 197, 94, 0.1);
  --loss: #ef4444;
  --loss-bg: rgba(239, 68, 68, 0.1);
}
```

**Tailwind utilities:**

```javascript
// tailwind.config.ts
colors: {
  metal: {
    gold: {
      DEFAULT: '#FFD700',
      muted: '#C9A227',
      bg: 'rgba(255, 215, 0, 0.1)',
      border: 'rgba(255, 215, 0, 0.3)',
    },
    silver: { ... },
    platinum: { ... },
    palladium: { ... },
  }
}
```

**Estimated time:** 30 minutes

---

### Task 5.2: Component Styling ✅ COMPLETED

**Metallic accents approach:**

1. **Metal badges** - Colored background matching metal type ✅
2. **Card borders** - Subtle metal-colored left border on holding cards ✅
3. **Allocation bar** - Segmented with metal colors ✅
4. **Icons** - Colored to match metal type ✅
5. **Hover states** - Subtle metallic glow ✅

> ✅ **Implemented:**
>
> - Added `glow` color variants for all metals in tailwind.config.ts
> - Added `boxShadow` utilities (`shadow-metal-gold`, etc.)
> - HoldingCard: metal-specific hover shadows and scale animations
> - MetalSummaryCard: metal-specific hover shadows and scale animations
> - HoldingCardCompact: metal-specific background glow

**Estimated time:** ~~1 hour~~ ✅ Done

---

### Task 5.3: Animations ✅ COMPLETED

**Using Framer Motion:**

1. **Slide-over panels** - Slide in from right with backdrop fade ✅
2. **Tab transitions** - Fade/slide between tab content ✅
3. **Number animations** - Count up/down on value changes ✅
4. **Card hover** - Subtle scale and shadow ✅
5. **Loading states** - Skeleton shimmer ✅

> ✅ **Implemented:**
>
> - ShimmerSkeleton.tsx with shimmer animation keyframes
> - Animations.tsx with Framer Motion wrappers
> - MetalDetailSlideOver: staggered content reveal
> - HoldingsCardGrid: AnimatedList wrapper
> - TransactionList: staggered month groups
> - TotalValueCard: fade-in entrance animation

```tsx
// Slide-over animation
<motion.div
  initial={{ x: "100%" }}
  animate={{ x: 0 }}
  exit={{ x: "100%" }}
  transition={{ type: "spring", damping: 25, stiffness: 200 }}
>
  {/* Panel content */}
</motion.div>

// Number animation
<motion.span
  key={value}
  initial={{ opacity: 0, y: -10 }}
  animate={{ opacity: 1, y: 0 }}
>
  {formatCurrency(value)}
</motion.span>
```

**Estimated time:** 1.5 hours

---

## Phase 6: Additional Features

### Task 6.1: Portfolio Value Chart

**Location:** Bottom of Overview tab

**Features:**

- Line chart showing portfolio value over time
- Time range selector: 1W, 1M, 3M, 1Y, All
- Hover tooltip with date and value
- Compare to initial investment line (optional)

**Data source:** Calculate from transaction history + historical prices

**Components:**

```
frontend/components/atomic/molecules/metals/
└── PortfolioChart.tsx          # Using Recharts or similar
```

**Estimated time:** 2 hours

---

### Task 6.2: CSV Export

**Location:** History tab

**Export format:**

```csv
Date,Type,Item,Quantity,Price Per Unit,Total,Currency,Spot Price,Notes
2026-01-15,BUY,Krugerrand 1 oz,2,3500.00,7000.00,EUR,2650.80,
2026-01-10,SELL,Silver Bar 500g,1,450.00,450.00,EUR,31.05,Partial sale
```

**Implementation:**

```typescript
// lib/utils/export.ts
export function exportTransactionsToCSV(transactions: Transaction[]): void {
  const headers = [
    "Date",
    "Type",
    "Item",
    "Quantity",
    "Price Per Unit",
    "Total",
    "Currency",
    "Spot Price",
    "Notes",
  ];
  const rows = transactions.map((t) => [
    t.transactionDate,
    t.transactionType,
    t.itemName,
    t.quantity,
    t.pricePerUnit,
    t.quantity * t.pricePerUnit,
    t.currency,
    t.spotPriceAtTransaction || "",
    t.notes || "",
  ]);

  const csv = [headers, ...rows].map((row) => row.join(",")).join("\n");
  downloadFile(csv, "metal-transactions.csv", "text/csv");
}
```

**Estimated time:** 1 hour

---

## Implementation Checklist (Updated)

### Phase 4: Core UI (Priority 1) ✅ COMPLETE

- [x] **4.1** Set up page structure with sidebar navigation
- [x] **4.7** Build empty state component
- [x] **4.2** Build Bento grid dashboard (Overview tab)
- [x] **4.3** Build Holdings tab with multiple views
- [x] **4.4** Build Add Item slide-over panel
- [x] **4.5** Build Item Detail slide-over panel
- [x] **4.6** Build History tab with filters, list, summary, CSV export
- [x] **4.8** Implement real-time price updates with animations

### Phase 5: Styling (Priority 2) ✅ COMPLETED

- [x] **5.1** Set up metal color system (done in tailwind.config.ts)
- [x] **5.2** Apply metallic accents to components
  - Added metal glow colors and box shadows to tailwind.config.ts
  - HoldingCard: hover shadow + scale animation per metal type
  - MetalSummaryCard: hover shadow + scale animation per metal type
  - TotalValueCard: fade-in entrance animation
- [x] **5.3** Add animations (slide-overs, numbers, hovers)
  - Created ShimmerSkeleton.tsx with loading state components
  - Created Animations.tsx with Framer Motion wrappers (FadeIn, ScaleIn, SlideIn, StaggerContainer, StaggerItem, HoverScale, AnimatedList, PulseGlow)
  - MetalDetailSlideOver: staggered content animations
  - HoldingsCardGrid: AnimatedList for card entrance
  - TransactionList: staggered group animations
  - Added keyframe animations: shimmer, pulse-glow, slide-in-right, fade-in, scale-in

### Phase 6: Additional Features (Priority 3) ✅ COMPLETE

- [x] **6.1** Portfolio value chart (PortfolioChart.tsx with time range selector)
- [x] **6.2** CSV export functionality (done in Phase 4.6)

---

## File Structure Summary (Actual Implementation)

```
frontend/
├── app/(root)/commodities/metals/inventory/
│   └── page.tsx                        # Main inventory page ✅
│
├── components/atomic/
│   ├── atoms/metals/
│   │   ├── MetalBadge.tsx              # Colored metal type badge ✅
│   │   ├── PriceDisplay.tsx            # Formatted currency display ✅
│   │   ├── ChangeIndicator.tsx         # +/- with color ✅
│   │   ├── WeightDisplay.tsx           # Weight with unit ✅
│   │   ├── PurityBadge.tsx             # Purity indicator ✅
│   │   ├── AnimatedNumber.tsx          # Smooth count animation ✅
│   │   ├── PriceUpdateIndicator.tsx    # Update status + timestamp ✅
│   │   ├── ShimmerSkeleton.tsx         # Loading skeletons with shimmer ✅
│   │   ├── Animations.tsx              # Framer Motion wrappers ✅
│   │   └── index.ts                    # Barrel exports ✅
│   │
│   ├── molecules/metals/
│   │   ├── TotalValueCard.tsx          # With AnimatedNumber + FadeIn ✅
│   │   ├── TotalProfitLossCard.tsx     # ✅
│   │   ├── AllocationChart.tsx         # Using Recharts ✅
│   │   ├── MetalAllocationBar.tsx      # ✅
│   │   ├── MetalSummaryCard.tsx        # With hover animations ✅
│   │   ├── SpotPricesTicker.tsx        # With AnimatedNumber ✅
│   │   ├── EmptyVaultState.tsx         # ✅
│   │   ├── HoldingsToolbar.tsx         # ✅
│   │   ├── HoldingsTable.tsx           # ✅
│   │   ├── HoldingsCardGrid.tsx        # With AnimatedList ✅
│   │   ├── HoldingsGroupedView.tsx     # ✅
│   │   ├── HoldingCard.tsx             # With hover animations ✅
│   │   ├── TransactionRow.tsx          # Single tx display ✅
│   │   ├── TransactionList.tsx         # With StaggerContainer ✅
│   │   ├── TransactionSummary.tsx      # Totals card ✅
│   │   ├── TransactionFilters.tsx      # Search, filters ✅
│   │   └── index.ts                    # Barrel exports ✅
│   │
│   └── organisms/metals/
│       ├── MetalsInventoryPage.tsx     # Main orchestrator ✅
│       ├── AddMetalSlideOver.tsx       # Combined catalog + custom ✅
│       └── MetalDetailSlideOver.tsx    # With StaggerContainer ✅
│
├── hooks/convex/
│   └── metals.ts                       # useMetals, useMetalsSummary, useVaultTransactions ✅
│
├── lib/
│   ├── api/metals.ts                   # Price fetching utilities ✅
│   ├── types/metals.ts                 # Base types ✅
│   ├── types/metals-extended.ts        # Extended types with valuations ✅
│   └── utils/export.ts                 # CSV export utility ✅
│
└── tailwind.config.ts                  # Metal colors + glow + animations ✅

# Deferred to later phases:
# - EditMetalSlideOver.tsx (if needed)
```

---

## Estimated Total Time

| Phase | Task                   | Time     | Status      |
| ----- | ---------------------- | -------- | ----------- |
| 4.1   | Page structure         | 1h       | ✅ Done     |
| 4.7   | Empty state            | 0.5h     | ✅ Done     |
| 4.2   | Bento dashboard        | 3h       | ✅ Done     |
| 4.3   | Holdings views         | 4h       | ✅ Done     |
| 4.4   | Add item slide-over    | 4h       | ✅ Done     |
| 4.5   | Item detail slide-over | 3h       | ✅ Done     |
| 4.6   | History tab            | 2.5h     | ✅ Done     |
| 4.8   | Real-time updates      | 1.5h     | ✅ Done     |
| 5.1   | Color system           | 0.5h     | ✅ Done     |
| 5.2   | Component styling      | 1h       | ✅ Done     |
| 5.3   | Animations             | 1.5h     | ✅ Done     |
| 6.1   | Portfolio chart        | 2h       | ✅ Done     |
| 6.2   | CSV export             | 1h       | ✅ Done     |
|       | **Total**              | **~27h** | ✅ COMPLETE |

---

## Project Status: ✅ ALL PHASES COMPLETE

All 6 phases of the Precious Metals Inventory feature have been implemented:

- **Phase 1-3:** Database, API, Catalog (foundation)
- **Phase 4:** Core UI with all tabs and features
- **Phase 5:** Styling with metallic accents and animations
- **Phase 6:** Portfolio chart and CSV export

---

## Technical Notes

### Price Calculation Formula

```
Market Value = spotPricePerOunce × fineWeightOz × (1 + premium) × quantity

Where:
- fineWeightOz = fineWeightGrams / 31.1034768
- fineWeightGrams = totalWeightGrams × (purity / 1000)
```

### Example Calculation

**Item:** 3x Krugerrand 1 oz

- Total weight: 33.93g each
- Purity: 916.7 (22 karat)
- Fine weight: 33.93 × 0.9167 = 31.10g = 1.0 oz
- Premium: 3.5%
- Spot price: €4,303.80/oz

**Value:** €4,303.80 × 1.0 × 1.035 × 3 = **€13,363.30**

### API Architecture (Price Data Flow)

**Data Flow:**

```
gold.de API → Supabase Edge Function (cron every 1 min) → Supabase DB
                                                              ↓
Client → Next.js API Routes → Drizzle ORM → Supabase DB (read)
```

**Key Points:**

- **gold.de is NEVER called from the client** - only from the Supabase edge function
- The edge function runs every minute via cron, fetching from gold.de and storing in Supabase
- Client-side uses `useMetalsPrices()` hook which calls Next.js API routes
- Next.js API routes (`/api/metals/prices/all/latest`, `/api/metals/gold/prices/extended`) query Supabase via Drizzle
- React Query auto-refreshes every 60 seconds (`refetchInterval: 1000 * 60`)

**Rate Limiting:**

- gold.de API: Called once per minute by edge function only
- Supabase reads: Unlimited (standard database queries)
- Client refresh: Every 60 seconds via React Query

---

## Dependencies

**New packages needed:**

- None required (using existing stack)

**Existing stack:**

- Convex (real-time database)
- shadcn/ui (UI components)
- Framer Motion (animations)
- TanStack Query (for external API fetching)
- Tailwind CSS (styling)

---

## Success Metrics

- [x] User can add items from catalog in < 30 seconds ✅
- [ ] Portfolio value updates in real-time (< 5 second delay) - needs animation polish
- [x] Page loads in < 2 seconds ✅
- [ ] Mobile experience is fully functional - desktop-first, mobile deferred
- [x] All calculations are accurate to 2 decimal places ✅
