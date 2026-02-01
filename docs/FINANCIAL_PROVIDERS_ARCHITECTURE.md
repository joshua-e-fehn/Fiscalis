# Financial Providers Architecture Guide

## Overview

Fiscalis uses a multi-provider strategy to aggregate financial data from various sources. Each provider specializes in a specific category of financial institutions, ensuring the best coverage and user experience.

## Provider Landscape

### Chosen Providers

| Provider      | Category               | Coverage                                     | Status         |
| ------------- | ---------------------- | -------------------------------------------- | -------------- |
| **Plaid**     | Banking                | US, UK, EU banks                             | ✅ Implemented |
| **Snaptrade** | Brokers                | 38+ brokers including Interactive Brokers    | ✅ Implemented |
| **Vezgo**     | Crypto                 | 40+ exchanges, 30+ blockchains, 500+ wallets | 🔄 Planned     |
| **FinAPI**    | German Banking/Brokers | German banks and depot accounts              | 🔄 Future      |

### Provider Capabilities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROVIDER CAPABILITIES                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  PLAID                          SNAPTRADE                                   │
│  ├── Banking (Primary)          ├── Traditional Brokers (Primary)           │
│  │   ├── Checking/Savings       │   ├── Interactive Brokers                 │
│  │   ├── Credit Cards           │   ├── Fidelity                            │
│  │   └── Money Market           │   ├── Schwab                              │
│  │                              │   ├── E*Trade                             │
│  └── Investments (NOT USED)     │   ├── Robinhood                           │
│      └── Conflicts with         │   ├── Alpaca                              │
│         Snaptrade               │   └── 32+ more...                         │
│                                 │                                            │
│  VEZGO                          FINAPI (Future)                             │
│  ├── Crypto Exchanges           ├── German Banks                            │
│  │   ├── Coinbase               │   ├── Deutsche Bank                       │
│  │   ├── Binance                │   ├── Commerzbank                         │
│  │   ├── Kraken                 │   └── Sparkasse, etc.                     │
│  │   └── 40+ more...            │                                            │
│  ├── Blockchains                └── German Depot Accounts                   │
│  │   ├── Ethereum                   ├── Comdirect                           │
│  │   ├── Bitcoin                    ├── Trade Republic                      │
│  │   └── 30+ more...                └── Scalable Capital                    │
│  └── Wallets                                                                 │
│      ├── MetaMask                                                           │
│      └── 500+ more...                                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Overlap Management

### The Problem

Some providers have overlapping coverage:

| Institution Type              | Potential Providers          | Risk                  |
| ----------------------------- | ---------------------------- | --------------------- |
| US Brokers (Fidelity, Schwab) | Plaid Investments, Snaptrade | Duplicate connections |
| Crypto (Coinbase, Binance)    | Snaptrade, Vezgo             | Duplicate positions   |
| German Brokers                | Snaptrade, FinAPI            | Duplicate accounts    |

### The Solution: Clear Provider Boundaries

**Golden Rule:** Assign ONE provider per asset category. Never use overlapping features.

| Asset Category           | Primary Provider | Why                                            |
| ------------------------ | ---------------- | ---------------------------------------------- |
| **Banking (US/UK)**      | Plaid            | Already implemented, excellent coverage        |
| **Banking (Germany/EU)** | FinAPI           | Better German bank coverage than Plaid         |
| **Traditional Brokers**  | Snaptrade        | Trading support, 38+ brokers, IB support       |
| **Crypto**               | Vezgo            | Specialized in crypto, better DeFi/NFT support |

### What NOT to Do

```
❌ WRONG: Using multiple providers for same category

User connects Fidelity via Plaid Investments
User connects Fidelity via Snaptrade
→ Same account appears twice!
→ Positions are duplicated!
→ Net worth is inflated!

✅ CORRECT: One provider per category

User wants to connect Fidelity
→ Router sends to Snaptrade (broker category)
→ Single source of truth
```

---

## Unified Architecture

### System Design

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              USER INTERFACE                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │ "Add Bank"      │  │ "Add Broker"    │  │ "Add Crypto"    │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
└───────────┼─────────────────────┼─────────────────────┼─────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          PROVIDER ROUTER                                       │
│                                                                                │
│   if (category === 'bank' && region === 'US')     → Plaid                    │
│   if (category === 'bank' && region === 'DE')     → FinAPI                   │
│   if (category === 'broker')                       → Snaptrade               │
│   if (category === 'crypto')                       → Vezgo                   │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
            │                     │                     │
            ▼                     ▼                     ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          PROVIDER ADAPTERS                                     │
│                                                                                │
│   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │
│   │ PlaidAdapter │  │ Snaptrade    │  │ VezgoAdapter │  │ FinAPIAdapter│    │
│   │              │  │ Adapter      │  │              │  │              │    │
│   │ • connect()  │  │ • connect()  │  │ • connect()  │  │ • connect()  │    │
│   │ • sync()     │  │ • sync()     │  │ • sync()     │  │ • sync()     │    │
│   │ • normalize()│  │ • normalize()│  │ • normalize()│  │ • normalize()│    │
│   └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘    │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                          UNIFIED DATA LAYER                                    │
│                                                                                │
│   ┌────────────────────┐  ┌────────────────────┐  ┌────────────────────┐     │
│   │ financial_         │  │ financial_         │  │ positions          │     │
│   │ connections        │  │ accounts           │  │                    │     │
│   │                    │  │                    │  │ • symbol           │     │
│   │ • provider         │  │ • connection_id    │  │ • asset_type       │     │
│   │ • institution_type │  │ • account_type     │  │ • quantity         │     │
│   │ • status           │  │ • balance          │  │ • market_value     │     │
│   └────────────────────┘  └────────────────────┘  └────────────────────┘     │
│                                                                                │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Unified Connection Table

All provider connections are stored in a single table with a `provider` discriminator:

```typescript
// Provider enumeration
export const providerEnum = pgEnum("provider", [
  "plaid",
  "snaptrade",
  "vezgo",
  "finapi",
]);

// Institution type enumeration
export const institutionTypeEnum = pgEnum("institution_type", [
  "bank",
  "broker",
  "crypto_exchange",
  "crypto_wallet",
]);

// Connection status
export const connectionStatusEnum = pgEnum("connection_status", [
  "connected",
  "pending",
  "error",
  "reauth_required",
  "disconnected",
]);

// Unified connections table
export const financialConnections = pgTable("financial_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id").notNull(),

  // Provider identification
  provider: providerEnum("provider").notNull(),
  providerConnectionId: text("provider_connection_id").notNull(),

  // Institution info (normalized across providers)
  institutionId: text("institution_id"),
  institutionName: text("institution_name").notNull(),
  institutionType: institutionTypeEnum("institution_type").notNull(),
  institutionLogo: text("institution_logo"),

  // Connection status
  status: connectionStatusEnum("status").default("connected"),
  errorMessage: text("error_message"),
  lastSyncAt: timestamp("last_sync_at"),

  // Provider-specific metadata (JSON)
  providerMetadata: jsonb("provider_metadata"),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### Unified Accounts Table

```typescript
export const accountTypeEnum = pgEnum("account_type", [
  // Banking
  "checking",
  "savings",
  "credit_card",
  "money_market",
  "cd",
  "mortgage",
  "loan",

  // Brokerage
  "brokerage",
  "retirement_401k",
  "retirement_ira",
  "retirement_roth",
  "hsa",

  // Crypto
  "crypto_exchange",
  "crypto_wallet",
  "defi",
]);

export const financialAccounts = pgTable("financial_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  connectionId: uuid("connection_id")
    .notNull()
    .references(() => financialConnections.id, { onDelete: "cascade" }),

  // Provider reference
  providerAccountId: text("provider_account_id").notNull(),

  // Normalized account info
  name: text("name").notNull(),
  officialName: text("official_name"),
  accountType: accountTypeEnum("account_type").notNull(),
  accountSubtype: text("account_subtype"),

  // Balances
  balance: numeric("balance", { precision: 20, scale: 8 }),
  availableBalance: numeric("available_balance", { precision: 20, scale: 8 }),
  currency: text("currency").default("USD"),

  // Metadata
  mask: text("mask"), // Last 4 digits

  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Unified Positions Table

```typescript
export const assetTypeEnum = pgEnum("asset_type", [
  // Traditional
  "stock",
  "etf",
  "mutual_fund",
  "bond",
  "option",
  "futures",
  "forex",

  // Crypto
  "cryptocurrency",
  "nft",
  "defi_position",

  // Other
  "cash",
  "other",
]);

export const positions = pgTable("positions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => financialAccounts.id, { onDelete: "cascade" }),

  // Asset identification
  symbol: text("symbol").notNull(),
  name: text("name"),
  assetType: assetTypeEnum("asset_type").notNull(),

  // Universal identifiers (when available)
  isin: text("isin"), // Stocks/ETFs
  cusip: text("cusip"), // US securities
  figi: text("figi"), // Bloomberg
  contractAddress: text("contract_address"), // Crypto tokens

  // Position data
  quantity: numeric("quantity", { precision: 20, scale: 8 }).notNull(),
  costBasis: numeric("cost_basis", { precision: 20, scale: 8 }),
  costBasisPerShare: numeric("cost_basis_per_share", {
    precision: 20,
    scale: 8,
  }),

  // Current valuation
  currentPrice: numeric("current_price", { precision: 20, scale: 8 }),
  marketValue: numeric("market_value", { precision: 20, scale: 8 }),
  currency: text("currency").default("USD"),

  // P&L
  unrealizedPL: numeric("unrealized_pl", { precision: 20, scale: 8 }),
  unrealizedPLPercent: numeric("unrealized_pl_percent", {
    precision: 10,
    scale: 4,
  }),

  lastSyncAt: timestamp("last_sync_at"),
  createdAt: timestamp("created_at").defaultNow(),
});
```

### Unified Transactions Table

```typescript
export const transactionTypeEnum = pgEnum("transaction_type", [
  // Banking
  "deposit",
  "withdrawal",
  "transfer",
  "payment",
  "fee",
  "interest",
  "refund",

  // Trading
  "buy",
  "sell",
  "dividend",
  "split",
  "merger",

  // Crypto
  "swap",
  "stake",
  "unstake",
  "reward",
  "airdrop",
  "mint",
  "burn",
]);

export const transactions = pgTable("transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  accountId: uuid("account_id")
    .notNull()
    .references(() => financialAccounts.id, { onDelete: "cascade" }),

  // Provider reference
  providerTransactionId: text("provider_transaction_id").notNull(),

  // Transaction details
  type: transactionTypeEnum("type").notNull(),
  amount: numeric("amount", { precision: 20, scale: 8 }).notNull(),
  currency: text("currency").default("USD"),

  // For trades
  symbol: text("symbol"),
  quantity: numeric("quantity", { precision: 20, scale: 8 }),
  price: numeric("price", { precision: 20, scale: 8 }),
  fees: numeric("fees", { precision: 20, scale: 8 }),

  // Dates
  date: timestamp("date").notNull(),
  settledDate: timestamp("settled_date"),

  // Description
  description: text("description"),
  category: text("category"),

  // Metadata
  pending: boolean("pending").default(false),

  createdAt: timestamp("created_at").defaultNow(),
});
```

---

## Provider Routing Implementation

### Router Logic

```typescript
// lib/providers/router.ts

type InstitutionCategory = "bank" | "broker" | "crypto";
type Region = "US" | "UK" | "DE" | "EU" | "CA" | "AU" | "INTERNATIONAL";
type Provider = "plaid" | "snaptrade" | "vezgo" | "finapi";

interface RoutingRule {
  category: InstitutionCategory;
  region: Region;
  provider: Provider;
  priority: number;
}

const ROUTING_RULES: RoutingRule[] = [
  // Banking - Regional providers
  { category: "bank", region: "US", provider: "plaid", priority: 1 },
  { category: "bank", region: "UK", provider: "plaid", priority: 1 },
  { category: "bank", region: "CA", provider: "plaid", priority: 1 },
  { category: "bank", region: "DE", provider: "finapi", priority: 1 },
  { category: "bank", region: "EU", provider: "finapi", priority: 1 },

  // Brokers - Snaptrade for all regions
  { category: "broker", region: "US", provider: "snaptrade", priority: 1 },
  { category: "broker", region: "UK", provider: "snaptrade", priority: 1 },
  { category: "broker", region: "CA", provider: "snaptrade", priority: 1 },
  { category: "broker", region: "DE", provider: "snaptrade", priority: 1 },
  { category: "broker", region: "EU", provider: "snaptrade", priority: 1 },
  { category: "broker", region: "AU", provider: "snaptrade", priority: 1 },
  {
    category: "broker",
    region: "INTERNATIONAL",
    provider: "snaptrade",
    priority: 1,
  },

  // Crypto - Vezgo for all regions
  { category: "crypto", region: "US", provider: "vezgo", priority: 1 },
  {
    category: "crypto",
    region: "INTERNATIONAL",
    provider: "vezgo",
    priority: 1,
  },
];

export function getProviderForCategory(
  category: InstitutionCategory,
  region: Region = "INTERNATIONAL",
): Provider {
  // Find matching rule
  const rule = ROUTING_RULES.find(
    (r) => r.category === category && r.region === region,
  );

  // Fallback to international rule if no region match
  if (!rule) {
    const fallback = ROUTING_RULES.find(
      (r) => r.category === category && r.region === "INTERNATIONAL",
    );
    return fallback?.provider ?? "snaptrade";
  }

  return rule.provider;
}

export function getProviderForInstitution(institutionId: string): Provider {
  // Known institution mappings for edge cases
  const INSTITUTION_OVERRIDES: Record<string, Provider> = {
    // German banks that should use FinAPI
    deutsche_bank: "finapi",
    commerzbank: "finapi",
    sparkasse: "finapi",

    // Crypto exchanges that should use Vezgo
    coinbase: "vezgo",
    binance: "vezgo",
    kraken: "vezgo",
  };

  return INSTITUTION_OVERRIDES[institutionId] ?? "snaptrade";
}
```

### Adapter Interface

```typescript
// lib/providers/types.ts

export interface ProviderAdapter {
  // Connection management
  createConnectUrl(userId: string, options?: ConnectOptions): Promise<string>;
  handleCallback(code: string, userId: string): Promise<Connection>;
  disconnect(connectionId: string): Promise<void>;

  // Data fetching
  getAccounts(connectionId: string): Promise<NormalizedAccount[]>;
  getPositions(connectionId: string): Promise<NormalizedPosition[]>;
  getTransactions(
    connectionId: string,
    options?: TransactionOptions,
  ): Promise<NormalizedTransaction[]>;

  // Sync
  syncConnection(connectionId: string): Promise<SyncResult>;

  // Status
  getConnectionStatus(connectionId: string): Promise<ConnectionStatus>;
}

export interface NormalizedAccount {
  providerAccountId: string;
  name: string;
  officialName?: string;
  type: AccountType;
  subtype?: string;
  balance: number;
  availableBalance?: number;
  currency: string;
  mask?: string;
}

export interface NormalizedPosition {
  symbol: string;
  name?: string;
  assetType: AssetType;
  quantity: number;
  costBasis?: number;
  currentPrice?: number;
  marketValue?: number;
  currency: string;
  identifiers?: {
    isin?: string;
    cusip?: string;
    figi?: string;
    contractAddress?: string;
  };
}
```

---

## Integration Comparison

### Authentication Flows

| Provider      | Auth Method                 | Session Duration | Re-auth Frequency       |
| ------------- | --------------------------- | ---------------- | ----------------------- |
| **Plaid**     | Plaid Link (OAuth modal)    | Persistent       | Rarely (bank-dependent) |
| **Snaptrade** | SnapTrade Connect (OAuth)   | Persistent       | Varies by broker        |
| **Vezgo**     | Vezgo Connect (OAuth modal) | Persistent       | Exchange-dependent      |
| **FinAPI**    | Web Form Flow               | Persistent       | Bank-dependent          |

### API Comparison

| Feature     | Plaid    | Snaptrade | Vezgo    | FinAPI   |
| ----------- | -------- | --------- | -------- | -------- |
| REST API    | ✅       | ✅        | ✅       | ✅       |
| Webhooks    | ✅       | ✅        | ✅       | ✅       |
| SDK (JS)    | ✅       | ✅        | ✅       | ✅       |
| Sandbox     | ✅       | ✅        | ✅       | ✅       |
| Rate Limits | Generous | Moderate  | Moderate | Moderate |

### Pricing Comparison

| Provider      | Pricing Model              | Estimated Cost               |
| ------------- | -------------------------- | ---------------------------- |
| **Plaid**     | Per connection + API calls | ~$0.50-1.00/connection/month |
| **Snaptrade** | Per active connection      | ~$0.10-0.50/connection/month |
| **Vezgo**     | Per connection             | ~$0.20/connection/month      |
| **FinAPI**    | Enterprise pricing         | Contact for quote            |

---

## User Experience Flow

### Connect Flow UI

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         "Connect Your Accounts"                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Choose what you'd like to connect:                                        │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐     │   │
│   │  │                 │  │                 │  │                 │     │   │
│   │  │   🏦            │  │   📈            │  │   ₿             │     │   │
│   │  │                 │  │                 │  │                 │     │   │
│   │  │   Bank          │  │   Brokerage     │  │   Crypto        │     │   │
│   │  │   Account       │  │   Account       │  │   Account       │     │   │
│   │  │                 │  │                 │  │                 │     │   │
│   │  │  Checking,      │  │  Stocks, ETFs,  │  │  Exchanges,     │     │   │
│   │  │  Savings,       │  │  Options,       │  │  Wallets,       │     │   │
│   │  │  Credit Cards   │  │  Retirement     │  │  DeFi           │     │   │
│   │  │                 │  │                 │  │                 │     │   │
│   │  └─────────────────┘  └─────────────────┘  └─────────────────┘     │   │
│   │         │                     │                     │              │   │
│   │         ▼                     ▼                     ▼              │   │
│   │   Opens Plaid          Opens Snaptrade       Opens Vezgo          │   │
│   │   Link                 Connect                Connect              │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │  🇩🇪 German Accounts? Use our German banking integration (FinAPI)   │   │
│   │     → Supports Deutsche Bank, Commerzbank, Sparkasse, and more      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Error Handling & Re-auth

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Connection Status Management                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Normal State:                                                             │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ ✅ Chase Bank (Plaid)           │ Last synced: 2 hours ago         │   │
│   │ ✅ Interactive Brokers (Snap)   │ Last synced: 4 hours ago         │   │
│   │ ✅ Coinbase (Vezgo)             │ Last synced: 1 hour ago          │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
│   Error State:                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │ ⚠️ Bank of America (Plaid)      │ Re-authentication required       │   │
│   │    └─ [Reconnect] button opens Plaid Link in update mode           │   │
│   │                                                                      │   │
│   │ ⚠️ Fidelity (Snaptrade)         │ Session expired                  │   │
│   │    └─ [Reconnect] button opens Snaptrade Connect in update mode    │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Roadmap

### Phase 1: Foundation (Completed)

- [x] Plaid banking integration
- [x] Unified database schema migration
- [x] Provider adapter interface

### Phase 2: Snaptrade Integration (Completed)

- [x] Snaptrade account setup & API keys
- [x] Snaptrade Connect UI component
- [x] OAuth callback handling
- [x] Position syncing
- [x] Transaction history

### Phase 3: Vezgo Integration

- [ ] Vezgo account setup
- [ ] Vezgo Connect UI component
- [ ] Crypto position normalization
- [ ] DeFi/NFT support

### Phase 4: FinAPI Integration (Future)

- [ ] FinAPI partnership/account
- [ ] German bank connection flow
- [ ] German depot account support
- [ ] PSD2/Open Banking compliance

### Phase 5: Advanced Features

- [ ] Cross-provider portfolio analytics
- [ ] Unified transaction categorization
- [ ] Tax lot tracking
- [ ] Performance reporting

---

## Folder Structure

```
lib/
├── providers/
│   ├── index.ts                    # Unified provider exports
│   ├── router.ts                   # Provider routing logic
│   ├── types.ts                    # Shared types & interfaces
│   │
│   ├── adapters/
│   │   ├── plaid.ts               # Plaid adapter implementation
│   │   ├── snaptrade.ts           # Snaptrade adapter implementation
│   │   ├── vezgo.ts               # Vezgo adapter implementation
│   │   └── finapi.ts              # FinAPI adapter implementation
│   │
│   └── normalizers/
│       ├── accounts.ts            # Account normalization
│       ├── positions.ts           # Position normalization
│       └── transactions.ts        # Transaction normalization
│
├── api/
│   ├── banking.ts                 # Banking API (Plaid)
│   ├── brokers.ts                 # Broker API (Snaptrade)
│   └── crypto.ts                  # Crypto API (Vezgo)
│
└── types/
    ├── banking.ts                 # Banking types
    ├── brokers.ts                 # Broker types
    └── crypto.ts                  # Crypto types
```

---

## Security Considerations

### Token Storage

| Provider  | Token Type    | Storage Location | Encryption |
| --------- | ------------- | ---------------- | ---------- |
| Plaid     | Access Token  | Database         | At rest    |
| Snaptrade | Connection ID | Database         | At rest    |
| Vezgo     | Access Token  | Database         | At rest    |
| FinAPI    | Access Token  | Database         | At rest    |

### Best Practices

1. **Never store user credentials** - Only store provider tokens
2. **Encrypt tokens at rest** - Use database-level encryption
3. **Use server-side API calls** - Never expose API keys to frontend
4. **Implement token refresh** - Handle token expiration gracefully
5. **Audit logging** - Log all connection/sync activities

---

## Webhook Handling

### Unified Webhook Architecture

```
Provider Webhooks                Your Server
     │                               │
     │  Plaid: ITEM_LOGIN_REQUIRED  │
     ├──────────────────────────────►│
     │                               │  ┌──────────────────────┐
     │  Snaptrade: connection.error │  │ Webhook Handler      │
     ├──────────────────────────────►│  │                      │
     │                               │  │ 1. Verify signature  │
     │  Vezgo: connection.error     │  │ 2. Parse event type  │
     ├──────────────────────────────►│  │ 3. Update connection │
     │                               │  │ 4. Notify user       │
     │                               │  └──────────────────────┘
```

### Webhook Events to Handle

| Event Type       | Plaid                  | Snaptrade          | Vezgo              | Action                    |
| ---------------- | ---------------------- | ------------------ | ------------------ | ------------------------- |
| Connection error | `ITEM_LOGIN_REQUIRED`  | `connection.error` | `connection.error` | Mark as `reauth_required` |
| New transactions | `TRANSACTIONS_WEBHOOK` | `transactions.new` | `transactions.new` | Sync transactions         |
| Holdings update  | `HOLDINGS_UPDATE`      | `holdings.updated` | `holdings.updated` | Sync positions            |

---

## Summary

This multi-provider architecture allows Fiscalis to:

1. **Maximize coverage** - Best provider for each category
2. **Avoid duplicates** - Clear provider boundaries
3. **Unified experience** - Single data model for all providers
4. **Future-proof** - Easy to add new providers
5. **Regional support** - Handle different markets (US, EU, Germany)

The key principle is **one provider per category**, with all data normalized into a unified schema for consistent portfolio views.
