# Vezgo Integration Implementation Plan

## Overview

This document outlines the step-by-step implementation plan for integrating Vezgo into Fiscalis to provide cryptocurrency portfolio tracking across exchanges, wallets, and DeFi protocols.

### Provider Summary

| Attribute        | Value                                        |
| ---------------- | -------------------------------------------- |
| **Provider**     | Vezgo                                        |
| **Category**     | Crypto                                       |
| **Coverage**     | 40+ exchanges, 30+ blockchains, 500+ wallets |
| **Auth Flow**    | OAuth (Connect popup)                        |
| **Data Storage** | Convex (real-time)                           |

### Architecture Decision: "Crypto" as Single Integration Category

Vezgo covers multiple asset types (exchanges, wallets, DeFi, NFTs), but we add **one "Crypto" category** to the sidebar with internal tabs for sub-categories:

```
Integrations (Sidebar)
├── 🏦 Banking      → Plaid (bank accounts)
├── 📊 Brokers      → Snaptrade (traditional securities)
└── ₿  Crypto       → Vezgo (all crypto assets)  ← NEW
```

**Why NOT merge crypto exchanges into "Brokers"?**

- Different mental model (users think "connect my Coinbase" not "connect my crypto broker")
- Different providers (Snaptrade for traditional, Vezgo for crypto)
- Different asset types (crypto vs stocks/ETFs)
- Self-custody exists (wallets have no traditional finance equivalent)

**Why NOT separate Wallets/DeFi/NFTs into top-level items?**

- Same provider (all through Vezgo)
- One connection can yield all types (MetaMask → tokens + NFTs + DeFi)
- Simpler navigation (3 sidebar items vs 5-6)
- Technical simplicity (one sync mechanism)

### Page Structure

```
app/(root)/crypto/
├── page.tsx              # Overview + total value + connect button
├── callback/page.tsx     # OAuth callback handler
├── exchanges/page.tsx    # Coinbase, Binance, Kraken positions
├── wallets/page.tsx      # MetaMask, Ledger, blockchain addresses
├── defi/page.tsx         # Aave, Uniswap LP, protocol positions
└── nfts/page.tsx         # NFT gallery view
```

### Navigation Within Crypto

```tsx
const cryptoTabs = [
  { name: "Overview", href: "/crypto", icon: LayoutDashboard },
  { name: "Exchanges", href: "/crypto/exchanges", icon: Building2 },
  { name: "Wallets", href: "/crypto/wallets", icon: Wallet },
  { name: "DeFi", href: "/crypto/defi", icon: Layers },
  { name: "NFTs", href: "/crypto/nfts", icon: Image },
];
```

---

## Prerequisites

- [x] **Create Vezgo Account** - Sign up at [vezgo.com](https://vezgo.com)
- [x] **Obtain API Credentials** - Get `VEZGO_CLIENT_ID` and `VEZGO_CLIENT_SECRET`
- [ ] **Configure Sandbox** - Set up sandbox environment for development
- [ ] **Review API Documentation** - [docs.vezgo.com](https://vezgo.com/docs/)

---

## Phase 1: Foundation ✅

**Goal**: Set up the basic infrastructure for Vezgo integration.

**Estimated Time**: 2-3 days

**Status**: ✅ COMPLETED

### Task 1.1: Environment Configuration ✅

- [x] Add environment variables to `.env.local`:
  ```env
  VEZGO_CLIENT_ID=your_client_id
  VEZGO_SECRET=your_secret
  ```
- [ ] Add environment variables to Convex dashboard
- [ ] Update `.env.example` with Vezgo placeholders

### Task 1.2: Install Dependencies ✅

- [x] Install Vezgo SDK:
  ```bash
  bun add vezgo-sdk-js
  ```
- [x] Verify TypeScript types are available

### Task 1.3: Create Convex Schema ✅

- [x] Create/update `convex/schema.ts` with Vezgo tables:

```typescript
// Vezgo Users (links Clerk user to Vezgo user)
vezgoUsers: defineTable({
  userId: v.string(),           // Clerk user ID
  vezgoToken: v.string(),       // Vezgo user token (encrypted)
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"]),

// Vezgo Connections (exchanges, wallets, addresses)
vezgoConnections: defineTable({
  userId: v.string(),
  accountId: v.string(),        // Vezgo account ID
  provider: v.string(),         // "coinbase", "binance", "metamask"
  providerType: v.string(),     // "exchange", "wallet", "blockchain"
  name: v.string(),             // Display name
  status: v.union(
    v.literal("active"),
    v.literal("error"),
    v.literal("syncing"),
    v.literal("disconnected")
  ),
  lastSyncAt: v.optional(v.number()),
  errorMessage: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_account", ["accountId"]),

// Vezgo Positions (crypto holdings)
vezgoPositions: defineTable({
  userId: v.string(),
  connectionId: v.id("vezgoConnections"),
  symbol: v.string(),           // "BTC", "ETH"
  name: v.optional(v.string()), // "Bitcoin", "Ethereum"
  quantity: v.number(),
  fiatValue: v.optional(v.number()),
  fiatCurrency: v.string(),     // "USD", "EUR"
  category: v.string(),         // "cryptocurrency", "token", "nft", "defi"
  // DeFi-specific fields
  protocol: v.optional(v.string()),
  poolName: v.optional(v.string()),
  apy: v.optional(v.number()),
  // NFT-specific fields
  contractAddress: v.optional(v.string()),
  tokenId: v.optional(v.string()),
  metadata: v.optional(v.any()), // NFT metadata JSON
  lastSyncAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_connection", ["connectionId"]),

// Vezgo Transactions
vezgoTransactions: defineTable({
  userId: v.string(),
  connectionId: v.id("vezgoConnections"),
  vezgoTransactionId: v.string(),
  type: v.string(),             // "buy", "sell", "transfer", "swap", "stake", "reward", "airdrop"
  symbol: v.string(),
  quantity: v.number(),
  fiatValue: v.optional(v.number()),
  fiatCurrency: v.string(),
  fee: v.optional(v.number()),
  feeCurrency: v.optional(v.string()),
  fromAddress: v.optional(v.string()),
  toAddress: v.optional(v.string()),
  txHash: v.optional(v.string()),
  date: v.string(),
  createdAt: v.number(),
})
  .index("by_user", ["userId"])
  .index("by_connection", ["connectionId"])
  .index("by_transaction", ["vezgoTransactionId"]),
```

### Task 1.4: Create Vezgo Utility Library

- [ ] Create `convex/lib/vezgo.ts`:

```typescript
import Vezgo from "vezgo-sdk-js";

export const getVezgoClient = () => {
  return Vezgo.init({
    clientId: process.env.VEZGO_CLIENT_ID!,
    secret: process.env.VEZGO_SECRET!,
  });
};

// Helper to get user-specific Vezgo instance
export const getVezgoUser = async (vezgoToken: string) => {
  const vezgo = getVezgoClient();
  return vezgo.login(vezgoToken);
};
```

### Task 1.5: Run Migration ✅

- [x] Run `bunx convex dev` to push schema changes
- [x] Verify tables are created in Convex dashboard

---

## Phase 2: Connection Flow ✅

**Goal**: Implement the user authentication and exchange connection flow.

**Estimated Time**: 3-4 days

**Status**: ✅ COMPLETED

### Task 2.1: Create Convex Actions ✅

- [x] Create `convex/actions/vezgo.ts`:
  - [x] `registerUser` - Register user with Vezgo and store encrypted token
  - [x] `deleteUser` - Delete Vezgo user data
  - [x] `getConnectUrl` - Get Vezgo Connect URL for linking accounts
  - [x] `handleCallback` - Process OAuth callback and store connection
  - [x] `deleteConnection` - Remove a connection
  - [x] `syncConnection` - Trigger sync for a connection
  - [x] `syncAllConnections` - Sync all user connections
  - [x] `getProviders` - Get list of available providers
  - [x] `syncConnectionInternal` - Internal action for background sync

### Task 2.2: Create Internal Mutations/Queries ✅

- [x] Create `convex/crypto.ts` with:
  - [x] Public queries: `getVezgoUser`, `getConnections`, `getConnectionsByType`, `getConnection`, `getPositions`, `getPositionsByCategory`, `getTotalValue`, `getTransactions`
  - [x] Internal queries: `getVezgoUserInternal`, `getConnectionInternal`, `getConnectionsByUserInternal`
  - [x] Internal mutations: `upsertVezgoUser`, `deleteVezgoUser`, `createConnection`, `updateConnectionStatus`, `deleteConnectionData`, `syncPositions`

### Task 2.3: Create React Hooks ✅

- [x] Create `hooks/convex/crypto.ts`:
  - [x] `useVezgoUser` - Get user registration status
  - [x] `useRegisterVezgo` - Register user with Vezgo
  - [x] `useVezgoConnections` - Get all connections
  - [x] `useVezgoConnectionsByType` - Filter by provider type
  - [x] `useVezgoPositions` - Get all positions
  - [x] `useVezgoPositionsByCategory` - Filter by category
  - [x] `useVezgoTotalValue` - Get total portfolio value
  - [x] `useVezgoTransactions` - Get transactions
  - [x] `useConnectCrypto` - Open Vezgo Connect flow
  - [x] `useSyncConnection` - Trigger connection sync
  - [x] `useDeleteConnection` - Delete a connection
  - [x] `useCryptoSummary` - Dashboard category summary

### Task 2.4: Create Callback Page ✅

- [x] Create `app/(root)/crypto/callback/page.tsx`:
  - [x] Handle OAuth callback from Vezgo Connect
  - [x] Support popup mode (postMessage to parent)
  - [x] Support redirect mode
  - [x] Show loading/success/error states
  - [x] Auto-close popup or redirect

### Task 2.5: Create VezgoConnectButton Component ✅

- [x] Create `components/atomic/atoms/VezgoConnectButton.tsx`:
  - [x] Auto-register user if needed
  - [x] Open Vezgo Connect popup
  - [x] Handle callback via postMessage
  - [x] Support variant styling (exchange/wallet/blockchain)
  - [x] Show loading states
  - [x] Compact version for cards/lists

---

## Phase 3: UI Components ✅

**Goal**: Build the crypto pages and components.

**Estimated Time**: 4-5 days

**Status**: ✅ COMPLETED

### Task 3.1: Update Crypto Layout ✅

- [x] Update `app/(root)/crypto/layout.tsx` with tab navigation:
  - [x] Overview, Exchanges, Wallets, DeFi, NFTs tabs
  - [x] Use shadcn Tabs component with router integration
  - [x] Icons for each tab (LayoutDashboard, Building2, Wallet, Layers, Image)

### Task 3.2: Create CryptoConnectionsCard Component ✅

- [x] Create `components/atomic/molecules/crypto/CryptoConnectionsCard.tsx`:
  - [x] Display connected exchanges/wallets with status badges
  - [x] Show provider type icons (exchange, wallet, blockchain, hardware)
  - [x] Last synced timestamp with custom `formatTimeAgo` helper
  - [x] Dropdown menu with Sync and Delete actions
  - [x] Empty state with VezgoConnectButton
  - [x] Loading state skeleton

### Task 3.3: Create CryptoHoldingsCard Component ✅

- [x] Create `components/atomic/molecules/crypto/CryptoHoldingsCard.tsx`:
  - [x] Total portfolio value display using `useVezgoTotalValue`
  - [x] Holdings breakdown by token with aggregation
  - [x] Custom progress bar for allocation percentages
  - [x] Token images via `imageUrl` field
  - [x] Connection count summary
  - [x] Configurable limit for top holdings display

### Task 3.4: Create CryptoPositionsTable Component ✅

- [x] Create `components/atomic/molecules/crypto/CryptoPositionsTable.tsx`:
  - [x] Sortable columns (symbol, quantity, value)
  - [x] Filter by connection/provider type
  - [x] Category badges (cryptocurrency, token, stablecoin, defi, nft)
  - [x] Token images and provider icons
  - [x] Empty/loading states
  - [x] Optional connection filter prop

### Task 3.5: Update Crypto Overview Page ✅

- [x] Update `app/(root)/crypto/page.tsx`:
  - [x] Stats cards row (Total Value, Positions, Connections, Tokens)
  - [x] VezgoConnectButton for quick connect
  - [x] CryptoHoldingsCard with top 5 holdings
  - [x] CryptoConnectionsCard
  - [x] CryptoPositionsTable with all positions
  - [x] Responsive grid layout

### Task 3.6: Create Exchanges Page ✅

- [x] Create `app/(root)/crypto/exchanges/page.tsx`:
  - [x] Filter connections by type "exchange"
  - [x] Description header
  - [x] VezgoConnectButton for exchange connections
  - [x] CryptoPositionsTable filtered to exchange connections

### Task 3.7: Create Wallets Page ✅

- [x] Create `app/(root)/crypto/wallets/page.tsx`:
  - [x] Filter connections by types: wallet, blockchain, hardware
  - [x] Description header for self-custody wallets
  - [x] VezgoConnectButton for wallet connections
  - [x] CryptoPositionsTable filtered to wallet connections

### Task 3.8: Create DeFi Page ✅

- [x] Create `app/(root)/crypto/defi/page.tsx`:
  - [x] Filter positions by category "defi"
  - [x] Protocol grouping with expandable cards
  - [x] APY display when available
  - [x] Position details with quantity and value
  - [x] Empty state messaging

### Task 3.9: Create NFTs Page ✅

- [x] Create `app/(root)/crypto/nfts/page.tsx`:
  - [x] Filter positions by category "nft"
  - [x] Grid gallery layout
  - [x] Collection grouping
  - [x] NFT cards with image placeholder
  - [x] Floor price display when available
  - [x] Empty state messaging

### Task 3.10: Add Crypto to Sidebar Navigation ✅

- [x] Update `components/atomic/organisms/navigationSidebar.tsx`:
  - [x] Add Crypto to integrations section with Bitcoin icon
  - [x] Route to `/crypto`
  - [x] Positioned alongside Banking and Brokers

### Files Created/Modified

**Components Created:**

- `components/atomic/molecules/crypto/CryptoConnectionsCard.tsx`
- `components/atomic/molecules/crypto/CryptoHoldingsCard.tsx`
- `components/atomic/molecules/crypto/CryptoPositionsTable.tsx`
- `components/atomic/molecules/crypto/index.ts` (barrel export)

**Pages Created/Updated:**

- `app/(root)/crypto/page.tsx` (complete rewrite)
- `app/(root)/crypto/exchanges/page.tsx`
- `app/(root)/crypto/wallets/page.tsx`
- `app/(root)/crypto/defi/page.tsx`
- `app/(root)/crypto/nfts/page.tsx`

**Navigation Updated:**

- `components/atomic/organisms/navigationSidebar.tsx`

---

## Phase 4: Advanced Features ✅

**Goal**: Add transaction history, webhook handling, and scheduled syncing.

**Estimated Time**: 4-5 days

**Status**: ✅ COMPLETED

### Task 4.1: Transaction Syncing ✅

- [x] Add `syncTransactions` action to `convex/actions/vezgo.ts`:
  - [x] `syncTransactionsInternal` - Internal action to fetch and store transactions
  - [x] `syncTransactions` - User-facing action to sync single connection transactions
  - [x] `syncAllTransactions` - Sync transactions for all connections
- [x] Create `components/atomic/molecules/crypto/CryptoTransactionsTable.tsx`:
  - [x] Sortable columns (date, symbol, quantity, value)
  - [x] Filter by transaction type and connection
  - [x] Search by symbol, tx hash, or address
  - [x] Transaction type badges with icons
  - [x] External explorer links for blockchain transactions
- [x] Add transaction filtering (by type, date, asset)
- [x] Support transaction types: buy, sell, transfer_in, transfer_out, swap, stake, unstake, reward, airdrop, mint, burn, fee, other
- [x] Create `convex/crypto.ts` `syncTransactions` mutation

### Task 4.2: Create Transactions Page ✅

- [x] Create `app/(root)/crypto/transactions/page.tsx`:
  - [x] Transaction statistics cards (total, buys, sells, swaps/transfers)
  - [x] Buy/sell volume display
  - [x] Transaction type summary badges
  - [x] Sync transactions button
  - [x] CryptoTransactionsTable integration
- [x] Update `app/(root)/crypto/layout.tsx`:
  - [x] Add Transactions tab to navigation
  - [x] Update grid to 6 columns

### Task 4.3: Add Transaction Sync Hooks ✅

- [x] Add to `hooks/convex/crypto.ts`:
  - [x] `useSyncVezgoTransactions` - Sync single connection
  - [x] `useSyncAllVezgoTransactions` - Sync all connections

### Task 4.4: Webhook Handler ✅

- [x] Create `convex/http.ts` with webhook endpoints:
  - [x] POST `/webhooks/vezgo` - Handle Vezgo webhook events
  - [x] GET `/webhooks/vezgo` - Health check endpoint
  - [x] GET `/health` - General health check
  - [x] Handle `connection.synced` event (trigger sync)
  - [x] Handle `connection.error` event (update status)
  - [x] Handle `connection.disconnected` event (mark disconnected)

### Task 4.5: Scheduled Sync ✅

- [x] Add to `convex/crons.ts`:
  - [x] 6-hour interval cron job for crypto sync
- [x] Create `scheduledSyncAllAction` internal action in `convex/actions/vezgo.ts`
- [x] Create `scheduledSyncAll` internal mutation in `convex/crypto.ts`

### Files Created/Modified

**Convex Files:**

- `convex/actions/vezgo.ts` - Added transaction sync actions and scheduled sync
- `convex/crypto.ts` - Added syncTransactions and scheduledSyncAll mutations
- `convex/http.ts` - New file for webhook handling
- `convex/crons.ts` - Added 6-hour crypto sync interval

**Components:**

- `components/atomic/molecules/crypto/CryptoTransactionsTable.tsx` - New component
- `components/atomic/molecules/crypto/index.ts` - Updated barrel export

**Pages:**

- `app/(root)/crypto/transactions/page.tsx` - New transactions page
- `app/(root)/crypto/layout.tsx` - Added Transactions tab

**Hooks:**

- `hooks/convex/crypto.ts` - Added transaction sync hooks

---

## Phase 5: Portfolio Integration ✅

**Goal**: Integrate crypto data with the main dashboard.

**Estimated Time**: 3-4 days

**Status**: ✅ COMPLETED

### Task 5.1: Unified Position Model ✅

- [x] Create `lib/types/portfolio.ts`:
  - [x] `UnifiedPosition` interface for cross-provider positions
  - [x] `FinancialProvider` type ("plaid" | "snaptrade" | "vezgo")
  - [x] `ProviderAllocation` interface for charts
  - [x] `NetWorthByProvider` interface for aggregated totals
  - [x] Helper functions: `plaidTypeToCategory`, `snaptradeTypeToCategory`, `vezgoTypeToCategory`
  - [x] Provider color and info constants

### Task 5.2: Aggregation Queries ✅

- [x] Create `convex/portfolio.ts`:
  - [x] `getTotalNetWorth` - Aggregate net worth across all providers
  - [x] `getProviderAllocation` - Allocation breakdown by provider for charts
  - [x] `getUnifiedPositions` - All positions in unified format (with filtering)
  - [x] `getCategoryBreakdown` - Positions aggregated by category across providers
  - [x] `getNetWorthForUser` - Internal query for cron jobs/actions

### Task 5.3: Dashboard Integration ✅

- [x] Update dashboard to show crypto in total net worth
- [x] Add provider allocation chart (ProviderAllocationChart)
- [x] Create unified positions table (UnifiedPositionsTable)
- [x] Add provider breakdown hooks (`hooks/convex/providers.ts`):
  - [x] `useNetWorthByProvider` - Detailed breakdown by provider
  - [x] `useProviderAllocation` - For allocation charts
  - [x] `useUnifiedPositions` - All positions with filtering
  - [x] `useCategoryBreakdown` - Categories across providers

### Task 5.4: Asset Allocation Chart ✅

- [x] Create allocation breakdown by category (existing AllocationChart)
- [x] Create allocation breakdown by provider (ProviderAllocationChart)
- [x] Add drill-down to individual positions via links

### Files Created/Modified

**Types:**

- `lib/types/portfolio.ts` - Unified types and helpers

**Convex:**

- `convex/portfolio.ts` - Server-side aggregation queries

**Hooks:**

- `hooks/convex/providers.ts` - Provider aggregation hooks

**Components:**

- `components/atomic/molecules/investments/ProviderAllocationChart.tsx`
- `components/atomic/molecules/investments/UnifiedPositionsTable.tsx`
- `components/atomic/molecules/investments/index.ts` (updated exports)

**Pages:**

- `app/(root)/dashboard/page.tsx` (integrated new components)

---

## Testing Checklist

### Unit Tests

- [ ] Vezgo utility functions
- [ ] Encryption/decryption for tokens
- [ ] Position normalization

### Integration Tests

- [ ] User registration flow
- [ ] Connection flow (sandbox)
- [ ] Position syncing
- [ ] Webhook handling

### E2E Tests

- [ ] Full connect flow in UI
- [ ] Position display after sync
- [ ] Error handling for failed connections

---

## Deployment Checklist

- [ ] Add production Vezgo API keys to Vercel
- [ ] Add production keys to Convex environment
- [ ] Configure webhook URL in Vezgo dashboard
- [ ] Test with real exchange (Coinbase sandbox)
- [ ] Monitor error rates after launch

---

## Post-Implementation

- [ ] **Update [ARCHITECTURE.md](./ARCHITECTURE.md)** to reflect Vezgo integration:
  - Add Vezgo to the high-level architecture diagram
  - Add Vezgo tables to Hybrid Database Architecture section
  - Update External Integrations provider overview table
  - Add Vezgo integration code example and flow diagram
  - Update Summary to include crypto provider
- [ ] **Update [FINANCIAL_PROVIDERS_ARCHITECTURE.md](./FINANCIAL_PROVIDERS_ARCHITECTURE.md)**:
  - Change Vezgo status from "🔄 Planned" to "✅ Implemented"
  - Update implementation roadmap phases

---

## Open Questions to Resolve

| Question                                     | Status | Decision |
| -------------------------------------------- | ------ | -------- |
| Webhook endpoint: Convex HTTP or Hono?       | Open   |          |
| Price source: Vezgo or CoinGecko supplement? | Open   |          |
| Store historical positions?                  | Open   |          |
| Multi-currency handling (EUR/USD)?           | Open   |          |
| Rate limit handling strategy?                | Open   |          |

---

## Timeline Summary

| Phase                          | Duration        | Dependencies  | Status       |
| ------------------------------ | --------------- | ------------- | ------------ |
| Phase 1: Foundation            | 2-3 days        | Vezgo account | ✅ COMPLETED |
| Phase 2: Connection Flow       | 3-4 days        | Phase 1       | ✅ COMPLETED |
| Phase 3: UI Components         | 4-5 days        | Phase 2       | ✅ COMPLETED |
| Phase 4: Advanced Features     | 4-5 days        | Phase 3       | ✅ COMPLETED |
| Phase 5: Portfolio Integration | 3-4 days        | Phase 4       | ✅ COMPLETED |
| **Total**                      | **~17-21 days** |               | ✅ COMPLETE  |

---

## References

- [Vezgo API Documentation](https://vezgo.com/docs/)
- [Vezgo JavaScript SDK](https://github.com/wealthica/vezgo-sdk-js)
- [Fiscalis Architecture Guide](./ARCHITECTURE.md)
- [Financial Providers Architecture](./FINANCIAL_PROVIDERS_ARCHITECTURE.md)
