# Investment Category Unification Plan

> **Goal:** Establish a single source of truth for investment categories and subcategories (`classification.ts`) with a compile-time-enforced UI config layer (`categoryUI.tsx`) that ensures every subcategory is accounted for in the frontend.

## Progress

| Phase                          | Status        | Notes                                                                     |
| ------------------------------ | ------------- | ------------------------------------------------------------------------- |
| Phase 1 — classification.ts    | ✅ Done       | Types, mappings, display names updated                                    |
| Phase 2 — categoryUI.tsx       | ✅ Done       | File created as `.tsx` (JSX needed for GemRingIcon)                       |
| Phase 2.6 — color palettes     | ✅ Done       | jewelry, trading-cards added; nfts moved to collectibles                  |
| Phase 3 — Refactor pages       | ✅ Done (7/8) | All asset pages refactored; liabilities kept custom card UX               |
| Phase 4 — Update hooks         | ✅ Done       | All 8 hooks refactored to use `makeSubcategoryBase()`                     |
| Phase 5 — Classification rules | ✅ Done       | NFT rule updated: crypto→collectibles                                     |
| Phase 6 — Data migration       | ✅ Done       | `reclassifyNftsToCollectibles` migration added                            |
| Phase 7 — Verify & cleanup     | ✅ Done       | Duplicate `InvestmentCategory` removed; re-exports from classification.ts |

TypeScript compilation verified clean after all phases.

## Architecture Overview

```
lib/types/classification.ts     ← Layer 1: Slugs, types, subcategoriesByCategory (server-safe, no React)
        ↓ (imports types)
lib/config/categoryUI.tsx       ← Layer 2: Record<Subcategory, UIMeta> per category + display groups
        ↓ (exports card arrays)
app/(root)/assets/*/page.tsx    ← Consumes pre-built card arrays (no more inline definitions)
hooks/convex/*.ts               ← Imports subcategory metadata for runtime SubcategoryData construction
```

**Enforcement chain:** Add subcategory to union → `Record` is no longer exhaustive → TS error in `categoryUI.tsx` → build fails → you fill in the UI metadata → done.

---

## Phase 1 — Update the Source of Truth (`classification.ts`)

### Task 1.1 — Update `CryptoSubcategory` type

Remove `"nfts"` from `CryptoSubcategory`. Result (5 members):

```ts
export type CryptoSubcategory =
  | "bitcoin"
  | "ethereum"
  | "altcoins"
  | "stablecoins"
  | "defi";
```

### Task 1.2 — Update `CollectiblesSubcategory` type

Replace current 7-member union with 9 members:

```ts
export type CollectiblesSubcategory =
  | "art"
  | "watches"
  | "wine"
  | "cars"
  | "jewelry"
  | "trading-cards"
  | "memorabilia" // Redefined: numismatic coins, stamps, historical ephemera (NOT bullion)
  | "nfts" // Moved from crypto
  | "other"; // Generic catch-all
```

- `memorabilia` = numismatic coins, stamps, and similar historical ephemera (not bullion)
- `jewelry` = precious jewelry, gemstone pieces (was previously mapped to `other`)
- `trading-cards` = sports cards, TCG, Pokémon (was previously under `memorabilia`)
- `nfts` = moved from crypto, stays in collectibles only
- `other` = catch-all for anything not covered

### Task 1.3 — Update `subcategoriesByCategory` mapping

- `crypto` array: remove `"nfts"`
- `collectibles` array: replace with the 9 new slugs

### Task 1.4 — Update `subcategoryDisplayNames`

- Remove `nfts` from crypto section (it'll be in collectibles)
- Add/update collectibles display names:
  - `jewelry` → "Jewelry"
  - `trading-cards` → "Trading Cards"
  - `memorabilia` → "Memorabilia & Ephemera"
  - `cars` → "Classic Cars" (update from "Cars")

**Files:** `frontend/lib/types/classification.ts`

---

## Phase 2 — Create the UI Config Layer (`lib/config/categoryUI.tsx`)

### Task 2.1 — Create `lib/config/categoryUI.tsx` with types

```ts
interface SubcategoryUIMeta {
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  examples: string[];
  color: string;
  href: string;
  implemented: boolean;
  /** If set, merge with other subcategories sharing this key into one card */
  displayGroup?: string;
  /** Optional section grouping for page-level splitting (e.g. "public" | "private" for equities) */
  section?: string;
}

interface DisplayGroupOverride {
  key: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
  examples: string[];
  href: string;
  color: string;
}
```

### Task 2.2 — Define exhaustive `Record` per category

One `Record<XxxSubcategory, SubcategoryUIMeta>` for each of the 8 categories. These use the exact subcategory union type as key → compile-time enforcement.

- Categories with no display groups (simple 1:1 mapping): cash, equities, bonds, commodities, real-estate, collectibles, liabilities
- Category with a display group: **crypto** (`bitcoin` + `ethereum` → `"btc-eth"` group)
- Special case: **cash** — `broker-cash` gets `implemented: false` (auto-populated from broker connections)
- Special case: **equities** — subcategories get `section: "public"` or `section: "private"`

### Task 2.3 — Define display group overrides

- `cryptoDisplayGroups`: one entry for `"btc-eth"` with title "Bitcoin & Ethereum"

### Task 2.4 — Implement `buildCategoryCards()` utility function

- Takes a `Record<string, SubcategoryUIMeta>` + optional `DisplayGroupOverride[]`
- Returns resolved `SubcategoryCardData[]` ready for rendering
- Grouped subcategories merge into one card using the override metadata
- Ungrouped subcategories become standalone cards

### Task 2.5 — Export pre-built card arrays

Export ready-to-use arrays for each category page:

- `cashCategoryCards`
- `equitiesCategoryCards` (+ `equitiesPublicCards` / `equitiesPrivateCards` filtered by section)
- `bondsCategoryCards`
- `cryptoCategoryCards`
- `commoditiesCategoryCards`
- `realEstateCategoryCards`
- `collectiblesCategoryCards`
- `liabilitiesCategoryCards`

Each is the result of `buildCategoryCards(xxxSubcategoryUI, xxxDisplayGroups?)`.

### Task 2.6 — Update color palettes in `investments.ts`

The `categoryColorPalettes` must be updated to match new subcategory slugs:

- Add collectibles colors: `jewelry`, `trading-cards`
- Redefine `memorabilia` color (redefined meaning)
- Move `nfts` color from crypto palette to collectibles palette
- Remove `nfts` from crypto color palette

**Files:** New file `frontend/lib/config/categoryUI.tsx`, update `frontend/lib/types/investments.ts`

---

## Phase 3 — Refactor Page Components

### Task 3.1 — `crypto/page.tsx`

- Remove inline `cryptoCategories` array
- Import `cryptoCategoryCards` from `@/lib/config/categoryUI`
- Replace `{cryptoCategories.map(...)}` with `{cryptoCategoryCards.map(...)}`

### Task 3.2 — `collectibles/page.tsx`

- Remove inline `collectibleCategories` array
- Import `collectiblesCategoryCards` from `@/lib/config/categoryUI`
- Update grid to render 9 cards

### Task 3.3 — `cash/page.tsx`

- Remove inline `cashCategories` array
- Import `cashCategoryCards`

### Task 3.4 — `equities/page.tsx`

- Remove inline `publicEquityCategories` and `privateEquityCategories` arrays
- Import `equitiesPublicCards` and `equitiesPrivateCards` (filtered by `section`)
- Keep the "Public Markets" / "Private Markets" section layout

### Task 3.5 — `bonds/page.tsx`

- Remove inline `bondCategories` array
- Import `bondsCategoryCards`

### Task 3.6 — `commodities/page.tsx`

- Remove inline `commodityCategories` array
- Import `commoditiesCategoryCards`

### Task 3.7 — `real-estate/page.tsx`

- Remove inline `realEstateCategories` array
- Import `realEstateCategoryCards`

### Task 3.8 — `liabilities/page.tsx`

- This page uses a custom `LiabilityCategory` interface with its own `LiabilityCategoryCard` component (shows debt values inline — different UX)
- **Decision:** Keep liabilities' card _rendering_ separate but source `id`, `title`, `description`, `href`, `icon`, `examples` from the centralized config
- The custom card component stays; only the data source changes

**Files:** All 8 `page.tsx` files under `(root)/assets/` and `(root)/liabilities/`

---

## Phase 4 — Update Hooks

### Task 4.1 — `hooks/convex/collectibles.ts`

- Currently hardcodes 6 subcategories (art, watches, wine, cars, coins, nfts)
- Update to 9 subcategories matching the new classification
- Import subcategory metadata (name, href, icon, color) from `categoryUI.tsx` instead of hardcoding

### Task 4.2 — `hooks/convex/crypto.ts`

- Currently builds `SubcategoryData[]` with bitcoin+ethereum merged (~line 758)
- Ensure the hook's data aggregation groups `bitcoin` and `ethereum` positions together for the `"btc-eth"` display group
- Import display group config from `categoryUI.tsx` to know which subcategories to merge

### Task 4.3 — Remaining hooks (equities, bonds, cash, commodities, realEstate, liabilities)

- Each hook currently hardcodes subcategory names, hrefs, icons, colors
- Refactor to import these from `categoryUI.tsx`, keeping only the data-fetching/aggregation logic
- Pattern: `for (const [slug, meta] of Object.entries(xxxSubcategoryUI)) { ... build SubcategoryData from DB data + meta ... }`

**Files:** All `hooks/convex/*.ts` category hooks

---

## Phase 5 — Update Classification Rules & Convex

### Task 5.1 — `convex/lib/classification/rules.ts`

- NFT classification rules: change result from `{ category: "crypto", subcategory: "nfts" }` to `{ category: "collectibles", subcategory: "nfts" }`
- Verify no rules produce removed/renamed subcategories

### Task 5.2 — `convex/lib/classification/engine.ts`

- Check Vezgo context classification — NFTs from Vezgo should now classify to collectibles
- Verify `tokenId` presence → collectibles/nfts

### Task 5.3 — `convex/categories.ts`

- If there are hardcoded subcategory references in category queries, update them

**Files:** `convex/lib/classification/rules.ts`, `convex/lib/classification/engine.ts`, `convex/categories.ts`

---

## Phase 6 — Data Migration

### Task 6.1 — Convex migration to reclassify existing data

- Positions with `investmentCategory: "crypto"` + `investmentSubcategory: "nfts"` → update to `"collectibles"` + `"nfts"`
- Any bank accounts/positions using old collectible subcategory mappings
- Add to `convex/migrations.ts` alongside existing migration patterns

**Files:** `convex/migrations.ts`

---

## Phase 7 — Verification & Cleanup

### Task 7.1 — TypeScript compiler check ✅

- Any `Record<XxxSubcategory, ...>` with missing keys = instant compile error
- All files compile cleanly with `tsc --noEmit`

### Task 7.2 — Remove duplicate `InvestmentCategory` type from `investments.ts` ✅

- `investments.ts` now re-exports from `classification.ts`:
  ```ts
  import type { InvestmentCategory } from "./classification";
  export type { InvestmentCategory } from "./classification";
  ```
- All 3 consumer files (`portfolio.ts`, `InvestmentDashboardSection.tsx`, `CategoryDashboardSection.tsx`) continue to work via re-export

### Task 7.3 — Verify `ClassificationOverrideDialog` ✅

- Already imports from `classification.ts` — auto-updated with new subcategories
- Dropdown will show all collectibles subcategories including NFTs

### Task 7.4 — Smoke test all 8 category pages

- TypeScript compilation verified clean after all phases
- Runtime smoke test deferred to manual QA

---

## Implementation Summary

### Phase 4 — Hook Refactoring

Added `makeSubcategoryBase(slug, meta)` helper to `categoryUI.tsx` that creates a zero-value `SubcategoryData` from `SubcategoryUIMeta`. All 8 hooks refactored:

- **collectibles.ts**: Full rewrite — `Object.entries(collectiblesSubcategoryUI).map()` generates all 9 subcategories
- **equities.ts, bonds.ts, cash.ts, realEstate.ts, liabilities.ts**: Loop over UI records with `makeSubcategoryBase` + data overrides
- **commodities.ts**: Loop with special-case for "metals" (real data), others get placeholder
- **crypto.ts**: BTC+ETH merge uses `cryptoDisplayGroups[0]` for metadata; altcoins/stablecoins/defi use `makeSubcategoryBase`

Removed from all hooks: lucide-react icon imports, `React` import, `categoryColorPalettes` import.

### Phase 5 — Classification Rules

Changed `vezgo_nft` rule in `convex/lib/classification/rules.ts` from `{ category: "crypto", subcategory: "nfts" }` to `{ category: "collectibles", subcategory: "nfts" }`. The crypto hook's `categorizeCryptoPosition()` already returns `null` for NFTs (skips them).

### Phase 6 — Data Migration

Added `reclassifyNftsToCollectibles` mutation to `convex/migrations.ts`. Scans `brokerPositions` and `plaidAccounts` for `investmentCategory: "crypto", investmentSubcategory: "nfts"` and updates to `"collectibles"`. Preserves user overrides.

### Phase 7 — Cleanup

Removed duplicate `InvestmentCategory` type from `lib/types/investments.ts`, replaced with re-export from `classification.ts`. Single source of truth achieved.

---

## Execution Order

| Order | Phase                                | Dependencies | Risk                                | Estimate |
| ----- | ------------------------------------ | ------------ | ----------------------------------- | -------- |
| 1     | Phase 1 (classification.ts)          | None         | Low — type changes propagate errors | Small    |
| 2     | Phase 2.1–2.5 (create categoryUI.ts) | Phase 1      | Medium — new file, core abstraction | Medium   |
| 3     | Phase 2.6 (update color palettes)    | Phase 1      | Low                                 | Small    |
| 4     | Phase 3 (refactor pages)             | Phase 2      | Low — mechanical replacement        | Medium   |
| 5     | Phase 4 (refactor hooks)             | Phase 2      | Medium — data aggregation logic     | Medium   |
| 6     | Phase 5 (classification rules)       | Phase 1      | Low — rule updates                  | Small    |
| 7     | Phase 6 (migration)                  | Phase 5      | Low — but irreversible in prod      | Small    |
| 8     | Phase 7 (verify + cleanup)           | All above    | Low                                 | Small    |

---

## Key Design Decisions

1. **Two separate files** (classification.ts + categoryUI.ts) because classification.ts must stay React-free for Convex server-side imports
2. **`Record<SubcategoryUnion, UIMeta>`** gives exhaustive compile-time checking — a missing key is a build error
3. **Display groups** solve the BTC+ETH merge cleanly without special-casing in page components
4. **`section` field** on `SubcategoryUIMeta` handles the equities public/private split without needing separate configs
5. **Liabilities page** keeps its custom card component (different UX showing debt values) but sources metadata from the centralized config
6. **`makeSubcategoryBase()` helper** in categoryUI.tsx bridges the gap between UI config (SubcategoryUIMeta) and runtime data (SubcategoryData), allowing hooks to simply spread-override with real data
