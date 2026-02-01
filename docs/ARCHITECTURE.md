# Fiscalis Architecture Guide

This document provides a comprehensive overview of the Fiscalis application architecture, explaining the relationships between different components, data flows, and design patterns used throughout the codebase.

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Repository Structure](#repository-structure)
3. [Technology Stack](#technology-stack)
4. [Data Flow Architecture](#data-flow-architecture)
5. [Investment Category Classification](#investment-category-classification)
6. [Convex Backend](#convex-backend)
7. [API Layer (Hono)](#api-layer-hono)
8. [Database Layer](#database-layer)
9. [Client-Side Data Management](#client-side-data-management)
10. [Authentication Flow (Clerk)](#authentication-flow-clerk)
11. [External Integrations](#external-integrations)
12. [Component Architecture](#component-architecture)

---

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                                   FRONTEND                                       │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                         Next.js App Router                                   ││
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌──────────────┐ ││
│  │  │  Dashboard  │    │  Banking    │    │ Commodities │    │  Calculator  │ ││
│  │  │    Page     │    │    Page     │    │    Page     │    │     Page     │ ││
│  │  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘    └──────────────┘ ││
│  │         │                  │                  │                             ││
│  │         ▼                  ▼                  ▼                             ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐   ││
│  │  │                        DATA LAYER                                    │   ││
│  │  │  ┌───────────────────────────┐    ┌───────────────────────────┐     │   ││
│  │  │  │   hooks/convex/           │    │   hooks/metals.ts         │     │   ││
│  │  │  │  - usePlaidAccounts()     │    │  - useMetalPrices()       │     │   ││
│  │  │  │  - usePlaidItems()        │    │  - useMetalLatest()       │     │   ││
│  │  │  │  - useBrokerConnections() │    │                           │     │   │││  │  │  - useVezgoConnections()  │    │                           │     │   ││
│  │  │  - useVezgoPositions()    │    │                           │     │   │││  │  │  │  (Convex real-time)       │    │  (React Query + Hono)     │     │   ││
│  │  │  └───────────┬───────────────┘    └─────────────┬─────────────┘     │   ││
│  │  └──────────────┼──────────────────────────────────┼───────────────────┘   ││
│  └─────────────────┼──────────────────────────────────┼────────────────────────┘│
│                    │                                  │                          │
└────────────────────┼──────────────────────────────────┼──────────────────────────┘
                     │                                  │
                     ▼                                  ▼
┌────────────────────────────────────┐    ┌────────────────────────────────────────┐
│           CONVEX BACKEND           │    │         HONO API + Supabase DB             │
│  ┌──────────────────────────────┐  │    │  ┌──────────────────────────────────┐  │
│  │   Real-time User Data        │  │    │  │    Time-series Data              │  │
│  │  • plaidItems (encrypted)    │  │    │  │  • precious_metal_prices         │  │
│  │  • plaidAccounts             │  │    │  │  • currency_exchange_rates       │  │
│  │  • plaidTransactions         │  │    │  │                                  │  │
│  │  • brokerConnections         │  │    │  │  /api/metals/*                   │  │
│  │  • brokerPositions           │  │    │  └──────────────────────────────────┘  │
│  └──────────────────────────────┘  │    │                                        │
│                │                   │    │                │                       │
│                ▼                   │    │                ▼                       │
│  ┌──────────────────────────────┐  │    │  ┌──────────────────────────────────┐  │
│  │    External APIs             │  │    │  │       Supabase PostgreSQL            │  │
│  │  • Plaid (Banking)           │  │    │  │       (Drizzle ORM)              │  │
│  │  • Snaptrade (Brokers)       │  │    │  └──────────────────────────────────┘  │
│  │  (via Convex actions)        │  │    │                                        │
│  └──────────────────────────────┘  │    │                                        │
└────────────────────────────────────┘    └────────────────────────────────────────┘
```

### Hybrid Database Architecture

Fiscalis uses a **hybrid architecture** with two backends optimized for different use cases:

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         HYBRID DATABASE ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│   CONVEX (Real-time, User Data)              Supabase PostgreSQL (Time-series)      │
│   ─────────────────────────────              ──────────────────────────────     │
│   • plaidItems (encrypted tokens)            • precious_metal_prices             │
│   • plaidAccounts (cached)                   • currency_exchange_rates           │
│   • plaidTransactions                        • world_bank_indicators             │
│   • snaptradeConnections (encrypted)                                             │
│   • snaptradeAccounts                        Accessed via:                       │
│   • snaptradePositions                       • Hono API routes (/api/metals/*)   │
│   • snaptradeActivities                      • Hono API routes (/api/worldbank/*)│
│   • vezgoUsers (encrypted token)             • Drizzle ORM                       │
│   • vezgoConnections                                                             │
│   • vezgoPositions                                                               │
│   • vezgoTransactions                                                            │
│   Accessed via:                                                                  │
│   • Convex hooks (useQuery, useMutation)                                         │
│   • Convex actions (for Plaid API calls)                                         │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Why Hybrid?**

- **Convex**: Provides real-time reactivity for user data (banking, brokers) with automatic cache invalidation and WebSocket subscriptions
- **Supabase**: Better suited for time-series data with periodic batch updates (metal prices, exchange rates) that doesn't need real-time sync

---

## Repository Structure

```
Fiscalis/
├── frontend/                      # Next.js 16 Application
│   ├── app/                       # App Router pages and API routes
│   │   ├── (api)/                 # API route group
│   │   │   └── api/[[...route]]/  # Hono catch-all route
│   │   │       ├── route.ts       # Hono app setup & exports
│   │   │       └── metals.ts      # Precious metals endpoints
│   │   ├── (auth)/                # Auth pages (sign-in, sign-up)
│   │   ├── (root)/                # Protected app pages
│   │   │   ├── dashboard/
│   │   │   ├── banking/
│   │   │   ├── brokers/
│   │   │   ├── commodities/
│   │   │   └── calculators/
│   │   └── (website)/             # Public marketing pages
│   │
│   ├── convex/                    # Convex Backend
│   │   ├── _generated/            # Auto-generated Convex types
│   │   ├── actions/               # Convex actions (external API calls)
│   │   │   ├── plaid.ts           # Plaid API integration
│   │   │   ├── snaptrade.ts       # Snaptrade API integration
│   │   │   └── vezgo.ts           # Vezgo API integration (crypto)
│   │   ├── lib/                   # Convex utilities
│   │   │   ├── encryption.ts      # AES-256-GCM encryption
│   │   │   └── vezgo.ts           # Vezgo client helpers
│   │   ├── auth.config.ts         # Clerk auth configuration
│   │   ├── schema.ts              # Database schema definition
│   │   ├── banking.ts             # Banking queries & mutations
│   │   ├── brokers.ts             # Broker queries & mutations
│   │   ├── categories.ts          # Category-based queries (cash, equities, etc.)
│   │   ├── classification.ts      # Classification override mutations
│   │   └── crypto.ts              # Crypto queries & mutations (Vezgo)
│   │
│   ├── components/                # UI Components
│   │   ├── atomic/                # Atomic Design Pattern
│   │   │   ├── atoms/             # Basic building blocks
│   │   │   ├── molecules/         # Combinations of atoms
│   │   │   └── organisms/         # Complex UI sections
│   │   └── ui/                    # UI library components
│   │       ├── shadcn/            # shadcn/ui components
│   │       └── aceternity/        # Aceternity UI components
│   │
│   ├── db/                        # Supabase Database configuration
│   │   └── drizzle/
│   │       ├── drizzle.ts         # DB connection setup
│   │       └── schema.ts          # Table definitions (time-series)
│   │
│   ├── hooks/                     # Data fetching hooks
│   │   ├── convex/                # Convex hooks (real-time)
│   │   │   ├── banking.ts         # Plaid data hooks
│   │   │   ├── brokers.ts         # Broker data hooks
│   │   │   ├── cash.ts            # Cash & money market summary
│   │   │   ├── classification.ts  # Classification override hooks
│   │   │   ├── crypto.ts          # Vezgo/Crypto data hooks
│   │   │   ├── equities.ts        # Equities summary hooks
│   │   │   ├── liabilities.ts     # Liabilities summary hooks
│   │   │   ├── portfolio.ts       # Portfolio aggregation hooks
│   │   │   └── index.ts           # Hook exports
│   │   ├── metals.ts              # Metals data hooks (React Query)
│   │   └── useVezgoConnect.ts     # Vezgo Connect modal hook
│   │
│   ├── lib/                       # Utilities and helpers
│   │   ├── api/                   # API fetch functions
│   │   │   └── metals.ts          # Metals API wrapper
│   │   ├── types/                 # TypeScript type definitions
│   │   │   ├── metals.ts          # Metals types
│   │   │   └── classification.ts  # Investment category types
│   │   ├── hono.ts                # Hono client setup
│   │   └── utils.ts               # General utilities
│   │
│   ├── providers/                 # React Context Providers
│   │   └── queryProvider.tsx      # TanStack Query + Convex provider
│   │
│   └── proxy.ts                   # Next.js 16 Proxy (auth middleware)
│
├── services/                      # Shared services
│   └── finance/
│       └── financeService.ts      # Financial calculations
│
└── backend/                       # Backend services
    └── edge_functions/            # Supabase Edge Functions
        └── supabase/
            └── functions/         # Scheduled price fetching
```

---

## Technology Stack

### Core Framework & Runtime

| Technology       | Version | Purpose                              |
| ---------------- | ------- | ------------------------------------ |
| **Next.js**      | ^16.1.4 | React framework with App Router      |
| **React**        | ^19.2.3 | UI library                           |
| **TypeScript**   | ^5.9.3  | Type-safe JavaScript                 |
| **Bun**          | latest  | JavaScript runtime & package manager |
| **Edge Runtime** | -       | Serverless edge functions            |

### Real-time Backend (Convex)

| Technology             | Version | Purpose                                     |
| ---------------------- | ------- | ------------------------------------------- |
| **Convex**             | ^1.31.6 | Real-time backend for user data             |
| **convex/react**       | -       | React hooks for Convex queries/mutations    |
| **convex/react-clerk** | -       | Clerk authentication integration for Convex |

### API Layer

| Technology              | Version  | Purpose                                  |
| ----------------------- | -------- | ---------------------------------------- |
| **Hono**                | ^4.11.5  | Lightweight web framework for Edge       |
| **@hono/clerk-auth**    | ^2.0.1   | Clerk authentication middleware for Hono |
| **@hono/zod-validator** | ^0.2.2   | Zod validation middleware for Hono       |
| **Zod**                 | ^3.25.76 | Schema validation & type inference       |

### Database & ORM (Time-series Data)

| Technology                   | Version | Purpose                        |
| ---------------------------- | ------- | ------------------------------ |
| **Neon PostgreSQL**          | -       | Serverless PostgreSQL database |
| **@neondatabase/serverless** | ^0.9.5  | Neon serverless driver         |
| **Drizzle ORM**              | ^0.31.4 | Type-safe SQL ORM              |
| **Drizzle Kit**              | ^0.22.8 | Drizzle migrations & CLI       |

### Authentication & Security

| Technology         | Version  | Purpose                          |
| ------------------ | -------- | -------------------------------- |
| **Clerk**          | ^6.36.10 | Authentication & user management |
| **@clerk/backend** | ^2.29.5  | Clerk backend SDK                |
| **@clerk/nextjs**  | ^6.36.10 | Clerk Next.js integration        |

### State Management & Data Fetching

| Technology                         | Version  | Purpose                                    |
| ---------------------------------- | -------- | ------------------------------------------ |
| **TanStack Query**                 | ^5.90.20 | Server state for time-series data (metals) |
| **@tanstack/react-query-devtools** | ^5.91.2  | Query DevTools for debugging               |

### UI & Styling

| Technology                   | Version  | Purpose                                  |
| ---------------------------- | -------- | ---------------------------------------- |
| **Tailwind CSS**             | ^3.4.19  | Utility-first CSS framework              |
| **tailwindcss-animate**      | ^1.0.7   | Animation utilities for Tailwind         |
| **tailwind-merge**           | ^2.6.0   | Merge Tailwind classes without conflicts |
| **shadcn/ui**                | -        | Accessible component library             |
| **Aceternity UI**            | -        | Modern UI components                     |
| **Radix UI**                 | various  | Headless UI primitives                   |
| **class-variance-authority** | ^0.7.1   | Variant-based component styling          |
| **clsx**                     | ^2.1.1   | Conditional class names                  |
| **Lucide React**             | ^0.479.0 | Icon library                             |
| **Framer Motion**            | ^11.18.2 | Animation library                        |

### Data Visualization & Maps

| Technology       | Version | Purpose                           |
| ---------------- | ------- | --------------------------------- |
| **Recharts**     | ^2.15.4 | React charting library            |
| **MapLibre GL**  | ^5.16.0 | Open-source map rendering         |
| **react-map-gl** | ^8.1.0  | React wrapper for MapLibre/Mapbox |

### Financial Integrations

| Technology           | Version | Purpose                                       |
| -------------------- | ------- | --------------------------------------------- |
| **Plaid**            | ^31.1.0 | Banking & financial data aggregation          |
| **react-plaid-link** | ^3.6.1  | Plaid Link React component                    |
| **Snaptrade**        | ^2.0.63 | Brokerage account aggregation (38+ brokers)   |
| **Vezgo**            | ^2.0.8  | Crypto aggregation (exchanges, wallets, DeFi) |
| **World Bank API**   | -       | Economic indicators & country data            |

### Infrastructure & Deployment

| Service        | Purpose                             |
| -------------- | ----------------------------------- |
| **Vercel**     | Frontend hosting & Edge Functions   |
| **Convex**     | Real-time backend hosting           |
| **Supabase**   | Serverless PostgreSQL (time-series) |
| **Clerk**      | Authentication service              |
| **Plaid**      | Banking API provider                |
| **Snaptrade**  | Brokerage API provider              |
| **World Bank** | Economic data API                   |

---

## Data Flow Architecture

### Banking Data Flow (Convex - Real-time)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT SIDE                                      │
│                                                                               │
│  1. Component renders          2. Convex hook called     3. WebSocket sub    │
│  ┌─────────────────┐          ┌─────────────────┐       ┌─────────────────┐  │
│  │  <BankingPage>  │ ──────▶  │usePlaidAccounts()│ ────▶│  Real-time      │  │
│  │   Component     │          │ (Convex useQuery)│       │  subscription   │  │
│  └─────────────────┘          └─────────────────┘       └────────┬────────┘  │
│                                                                   │          │
└───────────────────────────────────────────────────────────────────┼──────────┘
                                                                    │
                                    WebSocket connection to Convex  │
                                                                    │
┌───────────────────────────────────────────────────────────────────┼──────────┐
│                           CONVEX BACKEND                          ▼          │
│                                                                              │
│  4. Query handler              5. Auth check              6. DB Query       │
│  ┌─────────────────┐          ┌─────────────────┐        ┌─────────────────┐│
│  │  getAccounts()  │ ──────▶  │ ctx.auth.get    │ ─────▶ │  ctx.db.query() ││
│  │  (banking.ts)   │          │ UserIdentity()  │        │  (Convex DB)    ││
│  └─────────────────┘          └─────────────────┘        └─────────────────┘│
│                                                                              │
│  For Plaid API calls:                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Convex Actions (convex/actions/plaid.ts)                           │    │
│  │  • createLinkToken() - Get Plaid Link token                         │    │
│  │  • exchangeToken() - Exchange public token, store encrypted access  │    │
│  │  • refreshAccounts() - Sync accounts from Plaid                     │    │
│  │  • syncTransactions() - Fetch transactions from Plaid               │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Metals Data Flow (Hono + Supabase - Traditional)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT SIDE                                      │
│                                                                               │
│  1. Component renders          2. Hook called              3. API fn called   │
│  ┌─────────────────┐          ┌─────────────────┐         ┌─────────────────┐│
│  │ <CommoditiesPage>│ ──────▶ │ useMetalPrices()│ ──────▶ │  getMetalPrices││
│  │   Component     │          │ (React Query)   │         │  (lib/api)      ││
│  └─────────────────┘          └─────────────────┘         └────────┬────────┘│
│                                                                     │         │
└─────────────────────────────────────────────────────────────────────┼─────────┘
                                                                      │
                               HTTP Request: GET /api/metals/gold/prices/latest
                                                                      │
┌─────────────────────────────────────────────────────────────────────┼─────────┐
│                              SERVER SIDE                            ▼         │
│                                                                               │
│  4. Hono route handler         5. DB Query                                   │
│  ┌─────────────────┐          ┌─────────────────┐                            │
│  │  .get("/latest")│ ──────▶  │  db.select()    │                            │
│  │  (metals.ts)    │          │  (Drizzle/Supabase) │                            │
│  └─────────────────┘          └─────────────────┘                            │
│                                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```

---

## Investment Category Classification

The Investment Category Classification system is the core mechanism that maps raw financial data from external providers (Plaid, Snaptrade, Vezgo) into Fiscalis's unified investment taxonomy. This enables consistent categorization, aggregation, and analysis across all asset types.

### Classification Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    INVESTMENT CATEGORY CLASSIFICATION SYSTEM                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────┐     ┌─────────────────────────────────────────────┐│
│  │   EXTERNAL PROVIDERS    │     │         CLASSIFICATION TYPES               ││
│  ├─────────────────────────┤     │  (lib/types/classification.ts)             ││
│  │                         │     ├─────────────────────────────────────────────┤│
│  │  Plaid                  │     │  InvestmentCategory:                       ││
│  │  • type: "depository"   │────▶│  • cash, equities, bonds, crypto           ││
│  │  • subtype: "checking"  │     │  • commodities, real-estate, collectibles  ││
│  │                         │     │  • liabilities                              ││
│  │  Snaptrade              │     │                                             ││
│  │  • assetType: "equity"  │────▶│  InvestmentSubcategory (per category):     ││
│  │  • symbol: "AAPL"       │     │  • cash: checking, savings, broker-cash... ││
│  │                         │     │  • equities: stocks, etfs, funds, options..││
│  │  Vezgo                  │     │  • bonds: government, corporate, municipal ││
│  │  • assetType: "crypto"  │────▶│  • crypto: bitcoin, ethereum, stablecoins..││
│  │  • symbol: "BTC"        │     │  • commodities: metals, energy, agricultural│
│  │                         │     │  • liabilities: mortgages, loans, margin...││
│  └─────────────────────────┘     └─────────────────────────────────────────────┘│
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                        DATABASE SCHEMA FIELDS                                ││
│  │  (Both plaidAccounts and brokerPositions tables)                            ││
│  ├─────────────────────────────────────────────────────────────────────────────┤│
│  │  • investmentCategory: "cash" | "equities" | "bonds" | ...                  ││
│  │  • investmentSubcategory: "checking-accounts" | "stocks" | ...              ││
│  │  • classificationSource: "auto" | "user_override" | "admin"                 ││
│  │  • classificationRule: "plaid-checking" | "snaptrade-equity" | ...          ││
│  │  • userCategoryOverride: Optional user manual override                      ││
│  │  • userSubcategoryOverride: Optional user manual override                   ││
│  │  • valueInBaseCurrency: Amount converted to EUR                             ││
│  │  • exchangeRateUsed: Rate at time of sync                                   ││
│  └─────────────────────────────────────────────────────────────────────────────┘│
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Investment Categories & Subcategories

| Category         | Subcategories                                                                              |
| ---------------- | ------------------------------------------------------------------------------------------ |
| **cash**         | checking-accounts, savings-accounts, money-market, cds, treasury-bills, forex, broker-cash |
| **equities**     | stocks, etfs, funds, options, private                                                      |
| **bonds**        | government, corporate, municipal, savings, funds                                           |
| **crypto**       | bitcoin, ethereum, altcoins, stablecoins, defi, nfts                                       |
| **commodities**  | metals, energy, industrial, agricultural, rare-earth, gemstones                            |
| **real-estate**  | residential, commercial, reits, crowdfunding, land                                         |
| **collectibles** | art, watches, wine, cars, memorabilia, nfts, other                                         |
| **liabilities**  | mortgages, loans, credit-cards, margin-loans                                               |

### Classification Rules

Classification is performed automatically when syncing data from providers:

```typescript
// lib/types/classification.ts

// Example Plaid account classification (by account type)
interface AccountTypeMatcher {
  type: "account_type";
  provider: "plaid";
  values: string[]; // ["depository:checking"]
}

// Example Snaptrade position classification (by asset type)
interface AssetTypeMatcher {
  type: "asset_type";
  provider: "snaptrade";
  values: string[]; // ["equity", "stock"]
}

// Example symbol-based classification
interface SymbolExactMatcher {
  type: "symbol_exact";
  values: string[]; // ["BTC", "ETH"]
}

// Pattern-based classification for ETFs
interface SymbolPatternMatcher {
  type: "symbol_pattern";
  regex: string; // "^(SPY|QQQ|VTI|VOO)$"
}
```

### Classification Mapping by Provider

**Plaid (Banking) → Classification:**

| Plaid Account Type | Plaid Subtype    | Category      | Subcategory       |
| ------------------ | ---------------- | ------------- | ----------------- |
| depository         | checking         | cash          | checking-accounts |
| depository         | savings          | cash          | savings-accounts  |
| depository         | money market     | cash          | money-market      |
| depository         | cd               | cash          | cds               |
| credit             | credit card      | liabilities   | credit-cards      |
| loan               | mortgage         | liabilities   | mortgages         |
| loan               | student, auto... | liabilities   | loans             |
| investment         | \*               | (by position) | (by position)     |

**Snaptrade (Brokers) → Classification:**

| Snaptrade Asset Type | Category | Subcategory |
| -------------------- | -------- | ----------- |
| equity, stock        | equities | stocks      |
| etf                  | equities | etfs        |
| mutual_fund          | equities | funds       |
| option               | equities | options     |
| bond                 | bonds    | (varies)    |
| cryptocurrency       | crypto   | (by symbol) |
| forex                | cash     | forex       |
| cash (uninvested)    | cash     | broker-cash |

### Category-Based Queries

The classification system enables efficient category-based queries via database indexes:

```typescript
// convex/categories.ts

// Get all holdings for a specific category
export const getCashHoldings = query({
  handler: async (ctx) => {
    const userId = (await ctx.auth.getUserIdentity())!.subject;

    // Get bank accounts classified as cash
    const bankAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "cash"),
      )
      .collect();

    // Get broker positions classified as cash (money market funds, etc.)
    const brokerCash = await ctx.db
      .query("brokerPositions")
      .withIndex("by_category", (q) =>
        q.eq("userId", userId).eq("investmentCategory", "cash"),
      )
      .collect();

    // Get broker accounts with uninvested cash
    const brokerAccounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return { bankAccounts, brokerCash, brokerAccounts };
  },
});
```

### Category Summary Hooks

Frontend hooks provide aggregated category summaries for dashboards:

```typescript
// hooks/convex/cash.ts
export function useCashSummary() {
  const cashData = useQuery(api.categories.getCashHoldings);

  return {
    totalValue: cashData?.summary.totalValue ?? 0,
    bankTotal: cashData?.summary.bankTotal ?? 0,
    brokerCashTotal: cashData?.summary.brokerCashTotal ?? 0,
    accountCount: cashData?.summary.accountCount ?? 0,
    bySubcategory: cashData?.summary.bySubcategory ?? {},
  };
}

// hooks/convex/equities.ts
export function useEquitiesSummary() {
  const equitiesData = useQuery(api.categories.getEquitiesHoldings);
  // ... similar pattern
}

// hooks/convex/liabilities.ts
export function useLiabilitiesSummary() {
  const liabilitiesData = useQuery(api.categories.getLiabilities);
  // ... similar pattern
}
```

### User Classification Overrides

Users can manually override automatic classifications:

```typescript
// convex/classification.ts

export const overridePlaidAccountClassification = mutation({
  args: {
    accountId: v.id("plaidAccounts"),
    category: v.string(),
    subcategory: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      userCategoryOverride: args.category,
      userSubcategoryOverride: args.subcategory,
      classificationSource: "user_override",
    });
  },
});

export const resetPlaidAccountClassification = mutation({
  args: { accountId: v.id("plaidAccounts") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.accountId, {
      userCategoryOverride: undefined,
      userSubcategoryOverride: undefined,
      classificationSource: "auto",
    });
  },
});
```

### Classification Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CLASSIFICATION FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  1. SYNC FROM PROVIDER                                                          │
│  ┌─────────────────┐                                                            │
│  │  Plaid/Snaptrade│                                                            │
│  │  returns data   │                                                            │
│  └────────┬────────┘                                                            │
│           │                                                                      │
│           ▼                                                                      │
│  2. AUTO-CLASSIFICATION                                                         │
│  ┌─────────────────────────────────────────────────┐                            │
│  │  Apply classification rules based on:           │                            │
│  │  • Account type (Plaid)                         │                            │
│  │  • Asset type (Snaptrade)                       │                            │
│  │  • Symbol/name patterns                         │                            │
│  └────────┬────────────────────────────────────────┘                            │
│           │                                                                      │
│           ▼                                                                      │
│  3. STORE WITH CLASSIFICATION                                                   │
│  ┌─────────────────────────────────────────────────┐                            │
│  │  Save to Convex DB:                             │                            │
│  │  • investmentCategory                           │                            │
│  │  • investmentSubcategory                        │                            │
│  │  • classificationSource: "auto"                 │                            │
│  │  • classificationRule: "rule-id"                │                            │
│  │  • valueInBaseCurrency (EUR conversion)         │                            │
│  └────────┬────────────────────────────────────────┘                            │
│           │                                                                      │
│           ▼                                                                      │
│  4. QUERY BY CATEGORY (Frontend)                                                │
│  ┌─────────────────────────────────────────────────┐                            │
│  │  useCashSummary() → api.categories.getCash...   │                            │
│  │  useEquitiesSummary() → api.categories.getEq... │                            │
│  │  useLiabilitiesSummary() → api.categories.getL..│                            │
│  └────────┬────────────────────────────────────────┘                            │
│           │                                                                      │
│           ▼                                                                      │
│  5. OPTIONAL: USER OVERRIDE                                                     │
│  ┌─────────────────────────────────────────────────┐                            │
│  │  User clicks "Change Category" on an item       │                            │
│  │  → overridePlaidAccountClassification()         │                            │
│  │  → classificationSource: "user_override"        │                            │
│  └─────────────────────────────────────────────────┘                            │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File                          | Purpose                                                                  |
| ----------------------------- | ------------------------------------------------------------------------ |
| `lib/types/classification.ts` | Type definitions for categories, subcategories, and classification rules |
| `convex/categories.ts`        | Category-based Convex queries (getCashHoldings, getLiabilities, etc.)    |
| `convex/classification.ts`    | Classification override mutations                                        |
| `convex/schema.ts`            | Database schema with classification fields and indexes                   |
| `hooks/convex/cash.ts`        | Cash summary hook with subcategory breakdowns                            |
| `hooks/convex/equities.ts`    | Equities summary hook                                                    |
| `hooks/convex/liabilities.ts` | Liabilities summary hook                                                 |
| `hooks/convex/portfolio.ts`   | Portfolio-wide aggregation across all categories                         |

### Database Indexes

Efficient category queries are enabled by compound indexes:

```typescript
// convex/schema.ts
plaidAccounts: defineTable({...})
  .index("by_category", ["userId", "investmentCategory"])
  .index("by_subcategory", ["userId", "investmentCategory", "investmentSubcategory"]),

brokerPositions: defineTable({...})
  .index("by_category", ["userId", "investmentCategory"])
  .index("by_subcategory", ["userId", "investmentCategory", "investmentSubcategory"]),
```

---

## Convex Backend

### Schema Definition

```typescript
// convex/schema.ts
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // Banking (Plaid)
  plaidItems: defineTable({
    userId: v.string(), // Clerk user ID
    accessToken: v.string(), // Encrypted with AES-256-GCM
    itemId: v.string(), // Plaid item ID
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("pending_reauth"),
    ),
    errorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"]),

  plaidAccounts: defineTable({
    userId: v.string(),
    itemId: v.string(),
    accountId: v.string(),
    name: v.string(),
    type: v.string(),
    subtype: v.optional(v.string()),
    currentBalance: v.optional(v.number()),
    availableBalance: v.optional(v.number()),
    currency: v.string(),
    lastSynced: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"]),

  plaidTransactions: defineTable({
    userId: v.string(),
    accountId: v.string(),
    plaidTransactionId: v.string(),
    amount: v.number(),
    date: v.string(),
    name: v.string(),
    category: v.optional(v.string()),
    pending: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"]),

  // Brokers
  brokerConnections: defineTable({
    userId: v.string(),
    brokerType: v.string(),
    connectionName: v.string(),
    status: v.union(
      v.literal("connected"),
      v.literal("disconnected"),
      v.literal("error"),
      v.literal("pending"),
    ),
    accountId: v.optional(v.string()),
    username: v.optional(v.string()),
    lastSyncAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  brokerPositions: defineTable({
    userId: v.string(),
    connectionId: v.id("brokerConnections"),
    symbol: v.string(),
    name: v.optional(v.string()),
    quantity: v.number(),
    averageCost: v.optional(v.number()),
    currentPrice: v.optional(v.number()),
    marketValue: v.optional(v.number()),
    currency: v.string(),
  })
    .index("by_user", ["userId"])
    .index("by_connection", ["connectionId"]),

  // Crypto (Vezgo)
  vezgoUsers: defineTable({
    userId: v.string(), // Clerk user ID
    vezgoToken: v.string(), // Encrypted Vezgo user token (AES-256-GCM)
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),

  vezgoConnections: defineTable({
    userId: v.string(),
    vezgoUserId: v.id("vezgoUsers"),
    accountId: v.string(), // Vezgo account ID
    provider: v.string(), // e.g., "binance", "coinbase", "metamask"
    providerType: v.union(
      // Type of crypto connection
      v.literal("exchange"),
      v.literal("wallet"),
      v.literal("hardware"),
      v.literal("blockchain"),
    ),
    name: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("error"),
      v.literal("syncing"),
    ),
    lastSyncAt: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"])
    .index("by_provider_type", ["userId", "providerType"]),

  vezgoPositions: defineTable({
    userId: v.string(),
    connectionId: v.id("vezgoConnections"),
    symbol: v.string(), // e.g., "BTC", "ETH"
    name: v.optional(v.string()),
    quantity: v.number(),
    fiatValue: v.optional(v.number()),
    fiatTicker: v.optional(v.string()),
    category: v.union(
      // Asset classification
      v.literal("cryptocurrency"),
      v.literal("token"),
      v.literal("stablecoin"),
      v.literal("defi"),
      v.literal("nft"),
    ),
    // DeFi-specific fields
    protocol: v.optional(v.string()),
    poolName: v.optional(v.string()),
    apy: v.optional(v.number()),
    // NFT-specific fields
    nftCollection: v.optional(v.string()),
    nftTokenId: v.optional(v.string()),
    chain: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_connection", ["connectionId"])
    .index("by_category", ["userId", "category"]),

  vezgoTransactions: defineTable({
    userId: v.string(),
    connectionId: v.id("vezgoConnections"),
    transactionId: v.string(),
    type: v.union(
      // Transaction types
      v.literal("buy"),
      v.literal("sell"),
      v.literal("transfer_in"),
      v.literal("transfer_out"),
      v.literal("swap"),
      v.literal("stake"),
      v.literal("unstake"),
      v.literal("reward"),
      v.literal("fee"),
    ),
    symbol: v.string(),
    quantity: v.number(),
    fiatValue: v.optional(v.number()),
    fiatTicker: v.optional(v.string()),
    fee: v.optional(v.number()),
    feeTicker: v.optional(v.string()),
    chain: v.optional(v.string()),
    txHash: v.optional(v.string()),
    timestamp: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_connection", ["connectionId"])
    .index("by_type", ["userId", "type"]),
});
```

### Convex Hooks (Frontend)

```typescript
// hooks/convex/banking.ts
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

// Real-time subscription to accounts
export function usePlaidAccounts() {
  return useQuery(api.banking.getAccounts);
}

// Real-time subscription to items
export function usePlaidItems() {
  return useQuery(api.banking.getItems);
}

// Action to create Plaid Link token
export function useCreateLinkToken() {
  const createLinkToken = useAction(api.actions.plaid.createLinkToken);
  // ... wrapper with loading state
}

// Action to refresh accounts from Plaid
export function useRefreshAccounts() {
  const refreshAccounts = useAction(api.actions.plaid.refreshAccounts);
  // ... wrapper with loading state
}
```

### Security: Access Token Encryption

Plaid access tokens are encrypted at rest using AES-256-GCM:

```typescript
// convex/lib/encryption.ts
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export function encrypt(text: string, key: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key, "base64"), iv);
  const encrypted = Buffer.concat([
    cipher.update(text, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(encrypted: string, key: string): string {
  const [ivStr, authTagStr, encryptedStr] = encrypted.split(":");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    Buffer.from(key, "base64"),
    Buffer.from(ivStr, "base64"),
  );
  decipher.setAuthTag(Buffer.from(authTagStr, "base64"));
  return (
    decipher.update(Buffer.from(encryptedStr, "base64")) +
    decipher.final("utf8")
  );
}
```

---

## API Layer (Hono)

Hono is used exclusively for time-series data (precious metals, currency rates).

### Route Structure

```typescript
// app/(api)/api/[[...route]]/route.ts
import { Hono } from "hono";
import { handle } from "hono/vercel";
import metals from "./metals";

export const runtime = "edge";

const app = new Hono().basePath("/api");

const routes = app.route("/metals", metals);

export const GET = handle(app);
export const POST = handle(app);
export const DELETE = handle(app);

export type AppType = typeof routes;
```

### Metals Routes

| Method | Endpoint                               | Purpose                             |
| ------ | -------------------------------------- | ----------------------------------- |
| GET    | `/api/metals/:metal/prices/latest`     | Get latest price for a metal        |
| GET    | `/api/metals/:metal/prices/historical` | Get historical prices by time range |
| GET    | `/api/metals/:metal/prices/range`      | Get prices for custom date range    |

---

## Database Layer

### Supabase PostgreSQL (Time-series Data)

```typescript
// db/drizzle/drizzle.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### Schema (Time-series Only)

```typescript
// db/drizzle/schema.ts
export const precious_metal_prices = pgTable("precious_metal_prices", {
  timestamp: timestamp("timestamp").primaryKey(),
  gold_eur: numeric("gold_eur"),
  gold_usd: numeric("gold_usd"),
  silver_eur: numeric("silver_eur"),
  silver_usd: numeric("silver_usd"),
  platinum_eur: numeric("platinum_eur"),
  platinum_usd: numeric("platinum_usd"),
  palladium_eur: numeric("palladium_eur"),
  palladium_usd: numeric("palladium_usd"),
});

export const currency_exchange_rates = pgTable("currency_exchange_rates", {
  timestamp: timestamp("timestamp").primaryKey(),
  from_eur_to_usd: numeric("from_eur_to_usd"),
});
```

---

## Client-Side Data Management

### Provider Setup

```tsx
// providers/queryProvider.tsx
"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function Providers({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60 * 1000 },
    },
  });

  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

### Data Fetching Patterns

**Convex (Banking, Brokers)** - Real-time subscriptions:

```typescript
// Automatic real-time updates via WebSocket
const accounts = usePlaidAccounts(); // undefined while loading, then data
const items = usePlaidItems();
```

**React Query (Metals)** - Traditional REST:

```typescript
// Cached with manual refetch
const { data, isLoading } = useMetalPrices("gold", "1D");
```

---

## Authentication Flow (Clerk)

### Proxy (Edge Middleware)

```typescript
// proxy.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export const proxy = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});
```

### Auth in Convex

```typescript
// convex/banking.ts
export const getAccounts = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const userId = identity.subject; // Clerk user ID
    return await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
  },
});
```

---

## External Integrations

### Provider Overview

| Provider       | Category      | Data Provided                             | Status         |
| -------------- | ------------- | ----------------------------------------- | -------------- |
| **Plaid**      | Banking       | Accounts, balances, transactions          | ✅ Implemented |
| **Snaptrade**  | Brokers       | Positions, holdings, activities           | ✅ Implemented |
| **World Bank** | Economic Data | GDP, inflation, country indicators        | ✅ Implemented |
| **Vezgo**      | Crypto        | Exchanges, wallets, positions, DeFi, NFTs | ✅ Implemented |

### Plaid Integration (via Convex Actions)

```typescript
// convex/actions/plaid.ts
import { PlaidApi, Configuration, PlaidEnvironments } from "plaid";

const getPlaidClient = () => {
  const configuration = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
        "PLAID-SECRET": process.env.PLAID_SECRET,
      },
    },
  });
  return new PlaidApi(configuration);
};

export const createLinkToken = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const plaidClient = getPlaidClient();
    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: identity.subject },
      client_name: "Fiscalis",
      products: ["auth", "transactions"],
      country_codes: ["US", "DE"],
      language: "en",
    });

    return { linkToken: response.data.link_token };
  },
});
```

### Plaid Link Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            PLAID LINK FLOW                               │
│                                                                          │
│   Frontend                    Convex                      Plaid          │
│   ─────────                   ──────                      ─────          │
│       │                          │                          │            │
│       │  1. useCreateLinkToken() │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │                          │ 2. linkTokenCreate()     │            │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │◀──────────────────────── │    { link_token }        │            │
│       │    { linkToken }         │                          │            │
│       │                          │                          │            │
│       │  3. Open Plaid Link      │                          │            │
│       │ ─────────────────────────────────────────────────▶  │            │
│       │         User authenticates with bank                │            │
│       │◀───────────────────────────────────────────────────  │            │
│       │    onSuccess(public_token)                          │            │
│       │                          │                          │            │
│       │  4. useExchangeToken()   │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │  { publicToken }         │ 5. itemPublicTokenExchange│           │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │                          │    { access_token }      │            │
│       │                          │                          │            │
│       │                          │ 6. Encrypt & store       │            │
│       │                          │    in Convex DB          │            │
│       │                          │                          │            │
│       │◀──────────────────────── │                          │            │
│       │    { success: true }     │                          │            │
│       │                          │                          │            │
│       │  7. Real-time update     │                          │            │
│       │◀──────────────────────── │                          │            │
│       │    (via WebSocket)       │                          │            │
│       │                          │                          │            │
└───────┴──────────────────────────┴──────────────────────────┴────────────┘
```

### Snaptrade Integration (via Convex Actions)

```typescript
// convex/actions/snaptrade.ts
import { Snaptrade } from "snaptrade-typescript-sdk";

const getSnaptradeClient = () => {
  return new Snaptrade({
    clientId: process.env.SNAPTRADE_CLIENT_ID!,
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY!,
  });
};

export const registerUser = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const snaptrade = getSnaptradeClient();
    const response = await snaptrade.authentication.registerSnapTradeUser({
      userId: identity.subject,
    });

    return { userSecret: response.data.userSecret };
  },
});

export const getConnectionLink = action({
  args: { userSecret: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const snaptrade = getSnaptradeClient();
    const response = await snaptrade.authentication.loginSnapTradeUser({
      userId: identity.subject,
      userSecret: args.userSecret,
    });

    return { redirectUri: response.data.redirectURI };
  },
});
```

### Snaptrade Connect Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         SNAPTRADE CONNECT FLOW                           │
│                                                                          │
│   Frontend                    Convex                    Snaptrade        │
│   ─────────                   ──────                    ─────────        │
│       │                          │                          │            │
│       │  1. registerUser()       │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │                          │ 2. registerSnapTradeUser │            │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │◀──────────────────────── │    { userSecret }        │            │
│       │    { userSecret }        │                          │            │
│       │                          │                          │            │
│       │  3. getConnectionLink()  │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │                          │ 4. loginSnapTradeUser    │            │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │◀──────────────────────── │    { redirectURI }       │            │
│       │                          │                          │            │
│       │  5. Open Snaptrade Connect (iframe/redirect)        │            │
│       │ ─────────────────────────────────────────────────▶  │            │
│       │         User authenticates with broker              │            │
│       │◀───────────────────────────────────────────────────  │            │
│       │    Callback with authorizationId                    │            │
│       │                          │                          │            │
│       │  6. syncAccounts()       │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │                          │ 7. Fetch accounts/positions           │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │                          │ 8. Store in Convex DB    │            │
│       │◀──────────────────────── │                          │            │
│       │    { success: true }     │                          │            │
│       │                          │                          │            │
└───────┴──────────────────────────┴──────────────────────────┴────────────┘
```

### Vezgo Integration (via Convex Actions)

Vezgo provides unified access to crypto exchanges, wallets, DeFi protocols, and NFTs.

```typescript
// convex/actions/vezgo.ts
import Vezgo from "vezgo-sdk-js";
import { encrypt, decrypt } from "../lib/encryption";

const getVezgoClient = () => {
  return Vezgo.init({
    clientId: process.env.VEZGO_CLIENT_ID!,
    secret: process.env.VEZGO_CLIENT_SECRET!,
  });
};

export const registerUser = action({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const vezgo = getVezgoClient();
    const user = await vezgo.login();

    // Encrypt Vezgo token before storing
    const encryptionKey = process.env.CONVEX_ENCRYPTION_KEY!;
    const encryptedToken = encrypt(user.token, encryptionKey);

    await ctx.runMutation(api.crypto.upsertVezgoUser, {
      userId: identity.subject,
      vezgoToken: encryptedToken,
    });

    return { success: true };
  },
});

export const getConnectUrl = action({
  args: { provider: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // Get and decrypt user token
    const vezgoUser = await ctx.runQuery(api.crypto.getVezgoUser);
    const encryptionKey = process.env.CONVEX_ENCRYPTION_KEY!;
    const token = decrypt(vezgoUser.vezgoToken, encryptionKey);

    const vezgo = getVezgoClient();
    const user = vezgo.login(token);

    const connectUrl = await user.connect({
      provider: args.provider,
      redirectURI: `${process.env.NEXT_PUBLIC_APP_URL}/integrations/crypto`,
    });

    return { connectUrl };
  },
});

export const syncConnection = action({
  args: { accountId: v.string() },
  handler: async (ctx, args) => {
    // Sync positions and transactions from Vezgo
    const accounts = await vezgoUser.accounts.getOne(args.accountId);

    // Store positions with category classification
    for (const position of accounts.positions) {
      await ctx.runMutation(api.crypto.upsertPosition, {
        connectionId,
        symbol: position.symbol,
        quantity: position.amount,
        fiatValue: position.fiatValue,
        category: classifyAsset(position), // cryptocurrency, stablecoin, defi, nft
      });
    }
  },
});
```

### Vezgo Connect Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          VEZGO CONNECT FLOW                              │
│                                                                          │
│   Frontend                    Convex                      Vezgo          │
│   ─────────                   ──────                      ─────          │
│       │                          │                          │            │
│       │  1. registerUser()       │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │                          │ 2. vezgo.login()         │            │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │                          │    { user.token }        │            │
│       │                          │ 3. Encrypt & store token │            │
│       │◀──────────────────────── │                          │            │
│       │    { success: true }     │                          │            │
│       │                          │                          │            │
│       │  4. getConnectUrl()      │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │                          │ 5. user.connect()        │            │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │◀──────────────────────── │    { connectUrl }        │            │
│       │                          │                          │            │
│       │  6. Open Vezgo Connect (popup)                      │            │
│       │ ─────────────────────────────────────────────────▶  │            │
│       │         User authenticates with exchange/wallet     │            │
│       │◀───────────────────────────────────────────────────  │            │
│       │    Redirect with accountId                          │            │
│       │                          │                          │            │
│       │  7. syncConnection()     │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │                          │ 8. accounts.getOne()     │            │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │                          │    { positions, txns }   │            │
│       │                          │ 9. Store in Convex DB    │            │
│       │◀──────────────────────── │    (with encryption)     │            │
│       │    { success: true }     │                          │            │
│       │                          │                          │            │
│       │  10. Real-time update    │                          │            │
│       │◀──────────────────────── │                          │            │
│       │    (via WebSocket)       │                          │            │
│       │                          │                          │            │
└───────┴──────────────────────────┴──────────────────────────┴────────────┘
```

### Vezgo Provider Types

| Type         | Examples                  | Data Provided                    |
| ------------ | ------------------------- | -------------------------------- |
| `exchange`   | Binance, Coinbase, Kraken | Spot positions, trades, deposits |
| `wallet`     | MetaMask, Ledger, Trezor  | Token balances, NFTs, DeFi       |
| `hardware`   | Ledger, Trezor            | Multi-chain balances             |
| `blockchain` | Ethereum, Solana, Bitcoin | On-chain positions, transactions |

### Crypto Asset Classification

```typescript
// convex/crypto.ts - Asset categorization
const BTC_ETH_SYMBOLS = new Set(["BTC", "ETH", "WBTC", "WETH", "stETH"]);
const STABLECOIN_SYMBOLS = new Set(["USDT", "USDC", "DAI", "BUSD", "TUSD"]);

function classifyAsset(position: VezgoPosition): AssetCategory {
  if (position.category === "nft") return "nft";
  if (position.category === "defi") return "defi";
  if (STABLECOIN_SYMBOLS.has(position.symbol)) return "stablecoin";
  if (BTC_ETH_SYMBOLS.has(position.symbol)) return "cryptocurrency";
  return "token"; // Altcoins
}
```

### Crypto Hooks (Frontend)

```typescript
// hooks/convex/crypto.ts
import { useQuery, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

// Real-time subscription to crypto positions
export function useVezgoPositions() {
  return useQuery(api.crypto.getPositions);
}

// Real-time subscription to connections
export function useVezgoConnections() {
  return useQuery(api.crypto.getConnections);
}

// Connections filtered by type (exchange, wallet, etc.)
export function useVezgoConnectionsByType(type: ProviderType) {
  return useQuery(api.crypto.getConnectionsByType, { providerType: type });
}

// Aggregated crypto summary (total value, categories)
export function useCryptoSummary() {
  const positions = useVezgoPositions();
  // Calculate totals by category, 24h change, etc.
}

// Position allocations for charts
export function useCryptoPositionAllocations() {
  const positions = useVezgoPositions();
  // Group by symbol, calculate percentages
}
```

### World Bank API Integration (via Hono)

```typescript
// app/(api)/api/[[...route]]/worldbank.ts
import { Hono } from "hono";
import { db } from "@/db/drizzle/drizzle";
import { worldBankIndicators } from "@/db/drizzle/schema";

const worldbank = new Hono();

// Get GDP data for a country
worldbank.get("/indicators/:indicator/:country", async (c) => {
  const { indicator, country } = c.req.param();

  const data = await db
    .select()
    .from(worldBankIndicators)
    .where(
      and(
        eq(worldBankIndicators.indicator, indicator),
        eq(worldBankIndicators.countryCode, country),
      ),
    )
    .orderBy(desc(worldBankIndicators.year));

  return c.json({ data });
});

export default worldbank;
```

---

## Component Architecture

### Atomic Design Pattern

```
components/atomic/
├── atoms/           # Smallest, indivisible components
│   ├── bankAccountCard.tsx
│   ├── plaidLinkButton.tsx
│   ├── plaidUpdateButton.tsx
│   ├── addBrokerButton.tsx
│   ├── brokerConnectionCard.tsx
│   └── cards/
│       └── singleKPICard.tsx
│
├── molecules/       # Combinations of atoms
│   ├── bankAccountsCard.tsx
│   ├── bankReauthCard.tsx
│   ├── brokerConnectionsCard.tsx
│   ├── navigationDropdown.tsx
│   └── crypto/                      # Crypto-specific molecules
│       ├── CryptoConnectionsCard.tsx
│       ├── CryptoPositionsTable.tsx
│       ├── CryptoHoldingsCard.tsx
│       ├── CryptoAllocationChart.tsx
│       ├── CryptoLargestHoldingsCard.tsx
│       └── CryptoTransactionsTable.tsx
│
└── organisms/       # Complex, self-contained sections
    ├── banksCard.tsx
    ├── priceChart.tsx
    ├── header.tsx
    └── navigationSidebar.tsx
```

### Component → Hook Relationship

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            COMPONENT LAYER                               │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     <BanksCard />  (Organism)                    │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │  <BankAccountsCard />  (Molecule)                         │  │   │
│  │  │  ┌─────────────────┐  ┌─────────────────┐                 │  │   │
│  │  │  │<BankAccountCard>│  │<BankAccountCard>│  (Atoms)        │  │   │
│  │  │  └─────────────────┘  └─────────────────┘                 │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  │  ┌───────────────────────────────────────────────────────────┐  │   │
│  │  │  <PlaidLinkButton />  (Atom)                              │  │   │
│  │  └───────────────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────┬──────────────────────────────┘   │
│                                     │                                   │
└─────────────────────────────────────┼───────────────────────────────────┘
                                      │ uses Convex hooks
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CONVEX HOOK LAYER                              │
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌──────────────────┐ │
│  │ usePlaidAccounts()  │  │ useCreateLinkToken()│  │useVezgoPositions │ │
│  │ usePlaidItems()     │  │ useExchangeToken()  │  │useVezgoConnect.. │ │
│  │ useRefreshAccounts()│  │ useDeletePlaidItem()│  │useCryptoSummary()│ │
│  └──────────┬──────────┘  └──────────┬──────────┘  └────────┬─────────┘ │
│             │                        │                       │           │
└─────────────┼────────────────────────┼───────────────────────┼───────────┘
              │ WebSocket              │ HTTP (action)         │ WebSocket
              ▼                        ▼                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           CONVEX BACKEND                                 │
│                                                                          │
│  banking.ts (queries/mutations)     actions/plaid.ts (external API)     │
│  crypto.ts (queries/mutations)      actions/vezgo.ts (external API)     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

The Fiscalis architecture provides:

1. **Real-time user data** via Convex with automatic WebSocket subscriptions
2. **Time-series data** via Hono + Supabase for commodities pricing and economic indicators
3. **Secure storage** with AES-256-GCM encryption for sensitive tokens (Plaid, Snaptrade, Vezgo)
4. **Type safety** from database to UI with TypeScript throughout
5. **Clean separation** between real-time (banking, brokers, crypto) and traditional (metals, world data) patterns
6. **Multi-provider financial aggregation** with Plaid (banking), Snaptrade (brokers), and Vezgo (crypto)
7. **Unified classification system** mapping provider data to 8 investment categories with 50+ subcategories

### Key Design Decisions

- **Convex for user data**: Automatic real-time sync eliminates manual cache invalidation
- **Supabase for time-series**: Traditional SQL better suited for historical price queries
- **Clerk for auth**: Unified authentication across frontend, Convex, and Hono
- **Atomic Design**: Scalable component architecture with clear hierarchy
- **Provider per category**: One financial data provider per asset category (Plaid→banking, Snaptrade→brokers, Vezgo→crypto)
- **Classification at sync time**: Provider data classified to categories immediately upon sync, enabling efficient category-based queries via compound indexes
