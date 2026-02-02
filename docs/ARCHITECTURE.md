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
12. [Loans & Debt Management](#loans--debt-management)
13. [Precious Metals Vault](#precious-metals-vault)
14. [World Bank Data & Map](#world-bank-data--map)
15. [Portfolio Snapshots](#portfolio-snapshots)
16. [Performance Calculation System](#performance-calculation-system)
17. [Onboarding System](#onboarding-system)
18. [Component Architecture](#component-architecture)

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
│           CONVEX BACKEND           │    │         HONO API + Neon DB             │
│  ┌──────────────────────────────┐  │    │  ┌──────────────────────────────────┐  │
│  │   Real-time User Data        │  │    │  │    Time-series Data              │  │
│  │  • plaidItems (encrypted)    │  │    │  │  • precious_metal_prices         │  │
│  │  • plaidAccounts             │  │    │  │  • currency_exchange_rates       │  │
│  │  • plaidTransactions         │  │    │  │                                  │  │
│  │  • brokerConnections         │  │    │  │  /api/metals/*                   │  │
│  │  • brokerPositions           │  │    │  │  /api/world-data/*               │  │
│  └──────────────────────────────┘  │    │  └──────────────────────────────────┘  │
│                │                   │    │                                        │
│                ▼                   │    │                │                       │
│  ┌──────────────────────────────┐  │    │                ▼                       │
│  │    External APIs             │  │    │  ┌──────────────────────────────────┐  │
│  │  • Plaid (Banking)           │  │    │  │       Neon PostgreSQL            │  │
│  │  • SnapTrade (Brokers)       │  │    │  │       (Drizzle ORM)              │  │
│  │  • Vezgo (Crypto)            │  │    │  └──────────────────────────────────┘  │
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
│   CONVEX (Real-time, User Data)              Neon PostgreSQL (Time-series)       │
│   ─────────────────────────────              ─────────────────────────────       │
│   • plaidItems (encrypted tokens)            • precious_metal_prices             │
│   • plaidAccounts (cached)                   • currency_exchange_rates           │
│   • plaidTransactions                                                            │
│   • snaptradeUsers/Connections               Accessed via:                       │
│   • brokerAccounts/Positions                 • Hono API routes (/api/metals/*)   │
│   • brokerTransactions                       • Hono API routes (/api/world-data/*)│
│   • vezgoUsers (encrypted token)             • Drizzle ORM                       │
│   • vezgoConnections/Positions                                                   │
│   • vezgoTransactions                                                            │
│   • loans/loanPayments/loanScenarios                                             │
│   • vaultItems/vaultTransactions                                                 │
│   • metalCatalog                                                                 │
│   • worldBankIndicators/Favorites                                                │
│   • portfolioSnapshots                                                           │
│   • onboardingProgress                                                           │
│   • userSettings                                                                 │
│   Accessed via:                                                                  │
│   • Convex hooks (useQuery, useMutation)                                         │
│   • Convex actions (for external API calls)                                      │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

**Why Hybrid?**

- **Convex**: Provides real-time reactivity for user data (banking, brokers) with automatic cache invalidation and WebSocket subscriptions
- **Neon PostgreSQL**: Better suited for time-series data with periodic batch updates (metal prices, exchange rates) that doesn't need real-time sync

---

## Repository Structure

```
Fiscalis/
├── frontend/                      # Next.js 16 Application
│   ├── app/                       # App Router pages and API routes
│   │   ├── (api)/                 # API route group
│   │   │   └── api/
│   │   │       ├── [[...route]]/  # Hono catch-all route
│   │   │       │   ├── route.ts       # Hono app setup & exports
│   │   │       │   ├── metals.ts      # Precious metals price endpoints
│   │   │       │   ├── worlddata.ts   # World Bank data endpoints
│   │   │       │   └── worldbank-sync.ts # World Bank indicator sync
│   │   │       └── vezgo/             # Vezgo webhook handlers
│   │   ├── (auth)/                # Auth pages (sign-in, sign-up)
│   │   ├── (onboarding)/          # User onboarding flow
│   │   │   └── onboarding/
│   │   ├── (root)/                # Protected app pages
│   │   │   ├── dashboard/
│   │   │   ├── assets/            # Asset management pages
│   │   │   │   ├── bonds/
│   │   │   │   ├── cash/
│   │   │   │   ├── collectibles/
│   │   │   │   ├── commodities/   # Includes metals inventory
│   │   │   │   ├── crypto/
│   │   │   │   ├── equities/
│   │   │   │   └── real-estate/
│   │   │   ├── integrations/      # Provider connections
│   │   │   │   ├── banking/       # Plaid connections
│   │   │   │   ├── brokers/       # SnapTrade connections
│   │   │   │   └── crypto/        # Vezgo connections
│   │   │   ├── liabilities/       # Debt management
│   │   │   │   └── loans/
│   │   │   └── tools/             # Utility pages
│   │   │       ├── calculators/
│   │   │       └── world-map/
│   │   └── (website)/             # Public marketing pages
│   │
│   ├── convex/                    # Convex Backend
│   │   ├── _generated/            # Auto-generated Convex types
│   │   ├── actions/               # Convex actions (external API calls)
│   │   │   ├── plaid.ts           # Plaid API integration
│   │   │   ├── snaptrade.ts       # SnapTrade API integration
│   │   │   ├── vezgo.ts           # Vezgo API integration (crypto)
│   │   │   └── syncAll.ts         # Sync all providers at once
│   │   ├── lib/                   # Convex utilities
│   │   │   ├── encryption.ts      # AES-256-GCM encryption
│   │   │   └── vezgo.ts           # Vezgo client helpers & category mapping
│   │   ├── auth.config.ts         # Clerk auth configuration
│   │   ├── schema.ts              # Database schema definition
│   │   ├── banking.ts             # Banking queries & mutations (Plaid)
│   │   ├── brokers.ts             # Broker queries & mutations (SnapTrade)
│   │   ├── categories.ts          # Category-based queries (cash, equities, etc.)
│   │   ├── classification.ts      # Classification override mutations
│   │   ├── crypto.ts              # Crypto queries & mutations (Vezgo)
│   │   ├── loans.ts               # Loan management queries & mutations
│   │   ├── vault.ts               # Precious metals inventory management
│   │   ├── onboarding.ts          # Onboarding progress tracking
│   │   ├── portfolio.ts           # Portfolio-wide aggregation
│   │   ├── portfolioSnapshots.ts  # Historical portfolio tracking
│   │   ├── worldbank.ts           # World Bank indicator queries
│   │   ├── seedCatalog.ts         # Metal catalog seeding
│   │   ├── crons.ts               # Scheduled jobs (portfolio snapshots)
│   │   ├── migrations.ts          # Database migrations
│   │   └── http.ts                # HTTP webhook handlers
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
│   ├── db/                        # Neon Database configuration
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
│   │   │   ├── bonds.ts           # Bonds summary hooks
│   │   │   ├── collectibles.ts    # Collectibles summary hooks
│   │   │   ├── commodities.ts     # Commodities (non-metal) summary hooks
│   │   │   ├── realEstate.ts      # Real estate summary hooks
│   │   │   ├── liabilities.ts     # Liabilities summary hooks
│   │   │   ├── loans.ts           # Loan management hooks
│   │   │   ├── metals.ts          # Metals vault hooks
│   │   │   ├── portfolio.ts       # Portfolio aggregation hooks
│   │   │   ├── providers.ts       # Provider connection utilities
│   │   │   ├── onboarding.ts      # Onboarding progress hooks
│   │   │   ├── worldbank.ts       # World Bank indicator hooks
│   │   │   └── index.ts           # Hook exports
│   │   ├── metals.ts              # Metals price data hooks (React Query + Hono)
│   │   ├── worldbank.ts           # World Bank data hooks (React Query + Hono)
│   │   ├── useVezgoConnect.ts     # Vezgo Connect URL hook
│   │   ├── useVezgoNativeConnect.ts # Vezgo native connect SDK hook
│   │   ├── useTimePlayback.ts     # Historical time playback hook
│   │   └── use-mobile.tsx         # Mobile detection hook
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
    └── edge_functions/            # Legacy edge functions (now using Convex crons)
        └── supabase/              # Legacy Supabase config
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

| Service        | Purpose                                    |
| -------------- | ------------------------------------------ |
| **Vercel**     | Frontend hosting & Edge Functions          |
| **Convex**     | Real-time backend hosting + scheduled jobs |
| **Neon**       | Serverless PostgreSQL (time-series)        |
| **Clerk**      | Authentication service                     |
| **Plaid**      | Banking API provider                       |
| **SnapTrade**  | Brokerage API provider                     |
| **Vezgo**      | Crypto aggregation API provider            |
| **World Bank** | Economic data API                          |

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

### Metals Data Flow (Hono + Neon - Traditional)

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
│  │  (metals.ts)    │          │  (Drizzle/Neon)   │                            │
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

Hono is used for time-series data and external API proxying.

### Route Structure

```typescript
// app/(api)/api/[[...route]]/route.ts
import { Hono } from "hono";
import { handle } from "hono/vercel";
import metals from "./metals";
import worlddata from "./worlddata";
import worldbankSync from "./worldbank-sync";

export const runtime = "edge";

const app = new Hono().basePath("/api");

const routes = app
  .route("/metals", metals)
  .route("/world-data", worlddata)
  .route("/worldbank", worldbankSync);

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

### World Data Routes

| Method | Endpoint                                    | Purpose                                     |
| ------ | ------------------------------------------- | ------------------------------------------- |
| GET    | `/api/world-data/indicators/:code/:country` | Get World Bank indicator data for a country |
| GET    | `/api/world-data/indicators/:code`          | Get indicator data for all countries        |

### World Bank Sync Routes

| Method | Endpoint                | Purpose                        |
| ------ | ----------------------- | ------------------------------ |
| POST   | `/api/worldbank/sync`   | Trigger indicator catalog sync |
| GET    | `/api/worldbank/status` | Get sync status                |

---

## Database Layer

### Neon PostgreSQL (Time-series Data)

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

### Broker Account Balance & Cash Calculation

SnapTrade returns account data with `balance` and `cash` fields, but different brokers populate these fields differently. Some brokers (like Interactive Brokers) don't always populate the `cash` field directly. To handle this consistently, Fiscalis uses a unified cash calculation logic:

#### Cash Calculation Rules

```typescript
// Unified cash calculation logic used across the application
// Located in: convex/categories.ts (getCashHoldings) and frontend components

function getEffectiveCash(
  account: BrokerAccount,
  accountsWithPositions: Set<Id>,
): number {
  // Rule 1: If cash field is explicitly set and > 0, use it
  if ((account.cash ?? 0) > 0) {
    return account.cashValueInBaseCurrency ?? account.cash ?? 0;
  }

  // Rule 2: If account has NO positions and balance > 0, treat balance as cash
  // This handles accounts that are purely cash (e.g., settlement accounts)
  if (!accountsWithPositions.has(account._id) && (account.balance ?? 0) > 0) {
    return account.balance ?? 0;
  }

  // Rule 3: Otherwise, no cash
  return 0;
}
```

#### Why This Logic?

| Scenario                      | `balance` | `cash` | Has Positions | Effective Cash |
| ----------------------------- | --------- | ------ | ------------- | -------------- |
| Account with positions + cash | $10,000   | $2,000 | ✅ Yes        | **$2,000**     |
| Account with only positions   | $8,000    | $0     | ✅ Yes        | **$0**         |
| Cash-only account (no trades) | $5,000    | $0     | ❌ No         | **$5,000**     |
| Empty account                 | $0        | $0     | ❌ No         | **$0**         |

#### Implementation Locations

This logic is implemented in multiple places for consistency:

1. **Backend - Cash Category Query** (`convex/categories.ts`)

   ```typescript
   // getCashHoldings query uses this to aggregate broker cash for the Cash asset page
   const brokerAccountsWithCash = brokerAccounts.filter((acc) => {
     if ((acc.cash ?? 0) > 0) return true;
     if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0)
       return true;
     return false;
   });
   ```

2. **Frontend - Brokers Page KPI** (`app/(root)/integrations/brokers/page.tsx`)

   ```typescript
   // Calculate total cash for the KPI card
   const accountsWithPositions = new Set(
     positions?.map((p) => p.accountId) ?? [],
   );
   const totalCash =
     accounts?.reduce((sum, acc) => {
       if ((acc.cash ?? 0) > 0) return sum + (acc.cash ?? 0);
       if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0) {
         return sum + (acc.balance ?? 0);
       }
       return sum;
     }, 0) ?? 0;
   ```

3. **Frontend - Broker Connection Card** (`components/atomic/molecules/brokerAccountsCard.tsx`)
   ```typescript
   // Each connection card shows total value and cash breakdown
   const getEffectiveCash = (acc: BrokerAccount) => {
     if ((acc.cash ?? 0) > 0) return acc.cash ?? 0;
     if (!accountsWithPositions.has(acc._id) && (acc.balance ?? 0) > 0) {
       return acc.balance ?? 0;
     }
     return 0;
   };
   ```

#### Display Rules

To avoid redundancy in the UI:

- **Show cash** only when `cash !== balance` (i.e., when there's a mix of invested and cash)
- **Don't show cash** when `cash === balance` (entire account is cash - showing it twice would be redundant)

```typescript
// IntegrationConnectionCard.tsx & IntegrationAccountItem.tsx
const hasCash =
  totalCash !== undefined && totalCash > 0 && totalCash !== totalValue;
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

### Vezgo Provider Categories (Multi-Category Support)

A Vezgo connection can belong to **multiple categories** simultaneously. For example, Binance is both an `exchange` AND a `wallet` (you can store crypto without trading).

#### Schema Definition

```typescript
// convex/schema.ts - vezgoConnections table
vezgoConnections: defineTable({
  userId: v.string(),
  accountId: v.string(),
  provider: v.string(),
  // Categories array - a connection can have multiple categories
  // Based on Vezgo's providerCategories: ['exchanges', 'wallets', 'blockchains']
  categories: v.array(v.union(
    v.literal("exchange"),   // Centralized exchanges (CEX)
    v.literal("wallet"),     // Software/hardware wallets
    v.literal("blockchain"), // Direct blockchain addresses
  )),
  name: v.string(),
  logo: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("error"), ...),
  // ...other fields
})
```

#### Category Classification Logic

```typescript
// convex/lib/vezgo.ts - mapProviderCategories()

// Known exchanges (always classified as "exchange")
const KNOWN_EXCHANGES = new Set([
  "binance", "coinbase", "kraken", "bitstamp", "gemini",
  "kucoin", "okx", "bybit", "huobi", "crypto.com", ...
]);

// Known software/hardware wallets (classified as "wallet")
const KNOWN_WALLETS = new Set([
  "metamask", "phantom", "trust", "exodus", "coinbase_wallet",
  "ledger", "trezor", "keepkey", ...
]);

// Known blockchain addresses (classified as "blockchain")
const KNOWN_BLOCKCHAINS = new Set([
  "bitcoin", "ethereum", "solana", "cardano", "polkadot", ...
]);

export function mapProviderCategories(providerName: string): ProviderCategory[] {
  const name = providerName.toLowerCase();
  const categories: ProviderCategory[] = [];

  // Check each category list
  if (KNOWN_EXCHANGES.has(name)) categories.push("exchange");
  if (KNOWN_WALLETS.has(name)) categories.push("wallet");
  if (KNOWN_BLOCKCHAINS.has(name)) categories.push("blockchain");

  // Default: exchanges can also be wallets (you can hold without trading)
  if (categories.includes("exchange") && !categories.includes("wallet")) {
    categories.push("wallet");
  }

  // Fallback for unknown providers
  if (categories.length === 0) categories.push("exchange");

  return categories;
}
```

#### Display Order

Categories are displayed in a consistent order: **Exchange → Wallet → Blockchain**

```typescript
// components/atomic/molecules/crypto/CryptoConnectionsCard.tsx
const CATEGORY_ORDER: ProviderCategory[] = ["exchange", "wallet", "blockchain"];

function formatCategories(categories: ProviderCategory[]): string {
  return CATEGORY_ORDER.filter((cat) => categories.includes(cat))
    .map((cat) => categoryLabels[cat]) // "Exchange", "Wallet", "Blockchain"
    .join(", ");
}

// Examples:
// ["exchange", "wallet"] → "Exchange, Wallet"
// ["wallet", "blockchain"] → "Wallet, Blockchain"
// ["exchange"] → "Exchange"
```

#### Updating Categories

Users can manually update categories via mutation:

```typescript
// convex/crypto.ts
export const updateConnectionCategories = mutation({
  args: {
    connectionId: v.id("vezgoConnections"),
    categories: v.array(
      v.union(
        v.literal("exchange"),
        v.literal("wallet"),
        v.literal("blockchain"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    // Validation: at least one category required
    if (args.categories.length === 0) {
      throw new Error("At least one category is required");
    }
    await ctx.db.patch(args.connectionId, {
      categories: args.categories,
      updatedAt: Date.now(),
    });
  },
});
```

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

## Loans & Debt Management

The Loans system allows users to manually track and manage their debt (mortgages, auto loans, student loans, credit cards, etc.).

### Schema Overview

```typescript
// convex/schema.ts - Loan tables

loans: defineTable({
  userId: v.string(),
  name: v.string(), // "Home Mortgage", "Car Loan"
  loanType: v.union(
    v.literal("ANNUITY"), // Fixed payment (most common)
    v.literal("CONSTANT_PRINCIPAL"), // Decreasing payment
    v.literal("BULLET"), // Lump sum at end
    v.literal("INTEREST_ONLY_THEN"), // Interest-only period, then regular
  ),
  originalPrincipal: v.number(),
  currentBalance: v.number(),
  annualInterestRate: v.number(), // Decimal (0.05 = 5%)
  termMonths: v.number(),
  scheduledPayment: v.number(),
  paymentFrequency: v.union("MONTHLY", "QUARTERLY", "SEMI_ANNUAL", "ANNUAL"),
  startDate: v.string(),
  nextPaymentDate: v.string(),
  status: v.union("active", "paid_off", "defaulted", "refinanced"),
  // Optional fields
  lender: v.optional(v.string()),
  contractNumber: v.optional(v.string()),
  collateral: v.optional(v.string()),
  notes: v.optional(v.string()),
});

loanPayments: defineTable({
  userId: v.string(),
  loanId: v.id("loans"),
  paymentDate: v.string(),
  amount: v.number(),
  principalPortion: v.number(),
  interestPortion: v.number(),
  paymentType: v.union(
    "scheduled",
    "additional_principal",
    "prepayment",
    "final",
    "partial",
    "late",
  ),
  balanceAfterPayment: v.number(),
});

loanScenarios: defineTable({
  userId: v.string(),
  loanId: v.id("loans"),
  name: v.string(),
  extraMonthlyPayment: v.optional(v.number()),
  oneTimePrepayments: v.optional(v.array(/* date, amount */)),
  newInterestRate: v.optional(v.number()), // For refinancing scenarios
  // Calculated results
  projectedEndDate: v.optional(v.string()),
  totalInterestSaved: v.optional(v.number()),
  monthsSaved: v.optional(v.number()),
});
```

### Key Files

| File                           | Purpose                                              |
| ------------------------------ | ---------------------------------------------------- |
| `convex/loans.ts`              | Loan CRUD, payment recording, scenario calculations  |
| `hooks/convex/loans.ts`        | React hooks for loan data                            |
| `app/(root)/liabilities/loans` | Loans page with overview, details, scenarios         |
| `services/finance/`            | Financial calculation utilities (amortization, etc.) |

### Loan Page Features

- **Overview**: Total debt, monthly payments, next payment due, payoff progress
- **Loan Cards**: Individual loan details with progress visualization
- **Payment Tracking**: Record scheduled and extra payments
- **Scenario Planning**: "What-if" analysis for extra payments and refinancing

---

## Precious Metals Vault

The Vault system allows users to track their physical precious metals holdings (gold, silver, platinum, palladium).

### Schema Overview

```typescript
// convex/schema.ts - Vault tables

metalCatalog: defineTable({
  name: v.string(), // "Krugerrand 1 oz"
  metalType: v.union("gold", "silver", "platinum", "palladium"),
  category: v.union("coin", "bar"),
  purity: v.number(), // 999.9, 916.7 (22K gold)
  weightGrams: v.number(), // Total weight
  fineWeightGrams: v.number(), // Pure metal content
  fineWeightOz: v.number(), // Pure metal in troy ounces
  defaultBuyPremium: v.optional(v.number()), // 0.03 = 3% above spot
  defaultSellPremium: v.optional(v.number()), // -0.02 = 2% below spot
  country: v.optional(v.string()),
  mint: v.optional(v.string()),
  isPopular: v.boolean(), // Featured items
});

vaultItems: defineTable({
  userId: v.string(),
  catalogItemId: v.optional(v.id("metalCatalog")),
  customName: v.optional(v.string()), // For non-catalog items
  metalType: v.union("gold", "silver", "platinum", "palladium"),
  category: v.union("coin", "bar", "jewelry", "scrap"),
  purity: v.number(),
  weightGrams: v.number(),
  fineWeightGrams: v.number(),
  quantity: v.number(),
  buyPremium: v.optional(v.number()),
  sellPremium: v.optional(v.number()),
  purchasePricePerUnit: v.optional(v.number()),
  purchaseDate: v.optional(v.string()),
  storageLocation: v.optional(v.string()),
  notes: v.optional(v.string()),
});

vaultTransactions: defineTable({
  userId: v.string(),
  vaultItemId: v.id("vaultItems"),
  transactionType: v.union("buy", "sell", "gift_received", "gift_given"),
  quantity: v.number(),
  pricePerUnit: v.number(),
  currency: v.string(),
  transactionDate: v.string(),
  spotPriceAtTransaction: v.optional(v.number()),
  notes: v.optional(v.string()),
});
```

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         METALS PAGE DATA FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────────┐  │
│  │  Metal Prices   │    │   Vault Items    │    │  Metal Catalog      │  │
│  │  (Hono + Neon)  │    │  (Convex)        │    │  (Convex)           │  │
│  └────────┬────────┘    └────────┬─────────┘    └──────────┬──────────┘  │
│           │                      │                         │             │
│           └──────────────────────┼─────────────────────────┘             │
│                                  ▼                                       │
│                      ┌─────────────────────┐                            │
│                      │  Holdings Value     │                            │
│                      │  = fineWeightOz     │                            │
│                      │    × spotPrice      │                            │
│                      │    × (1 + premium)  │                            │
│                      └─────────────────────┘                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Key Files

| File                                   | Purpose                                  |
| -------------------------------------- | ---------------------------------------- |
| `convex/vault.ts`                      | Vault CRUD, transaction recording        |
| `convex/seedCatalog.ts`                | Metal catalog seeding                    |
| `hooks/convex/metals.ts`               | Vault data hooks                         |
| `hooks/metals.ts`                      | Price data hooks (React Query + Hono)    |
| `app/(root)/assets/commodities/metals` | Unified metals page (prices + inventory) |
| `components/atomic/organisms/metals/`  | MetalsPage, MetalsInventoryTable, etc.   |

### Features

- **Overview Tab**: Total holdings value, allocation chart, quick stats
- **Prices Tab**: Live metal prices, historical charts, compare mode
- **Holdings Tab**: Detailed inventory table with P/L calculations
- **History Tab**: Transaction history with buy/sell tracking

---

## World Bank Data & Map

The World Map feature provides an interactive visualization of economic indicators from the World Bank API.

### Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     WORLD BANK DATA ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────┐      ┌─────────────────┐     ┌──────────────────┐  │
│  │  World Bank API │      │  Convex DB      │     │  Neon PostgreSQL │  │
│  │  (indicators)   │      │  (catalog)      │     │  (data cache)    │  │
│  └────────┬────────┘      └────────┬────────┘     └─────────┬────────┘  │
│           │                        │                        │           │
│           ▼                        ▼                        ▼           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     World Map Component                          │   │
│  │  • Indicator search (Convex search index)                       │   │
│  │  • Country selection (MapLibre GL)                              │   │
│  │  • Data visualization (Recharts)                                │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Schema

```typescript
// convex/schema.ts

worldBankIndicators: defineTable({
  code: v.string(),                           // "NY.GDP.MKTP.CD"
  name: v.string(),                           // "GDP (current US$)"
  description: v.optional(v.string()),
  sourceId: v.optional(v.string()),           // "2" for WDI
  sourceName: v.optional(v.string()),
  topics: v.optional(v.array(v.string())),
  nameLower: v.string(),                      // For case-insensitive search
  codeLower: v.string(),
  // Reliability tracking
  timeoutCount: v.number(),
  status: v.union("ok", "warning", "error"),
  lastTestedAt: v.optional(v.number()),
})
  .index("by_code", ["code"])
  .searchIndex("search_indicators", {
    searchField: "nameLower",
    filterFields: ["status", "sourceId"],
  }),

worldBankFavorites: defineTable({
  userId: v.string(),
  indicatorCode: v.string(),
  indicatorName: v.string(),
  addedAt: v.number(),
}).index("by_user", ["userId"]),
```

### Key Files

| File                         | Purpose                                 |
| ---------------------------- | --------------------------------------- |
| `convex/worldbank.ts`        | Indicator search, favorites             |
| `hooks/convex/worldbank.ts`  | Convex hooks for indicators             |
| `hooks/worldbank.ts`         | React Query hooks for data fetching     |
| `app/(root)/tools/world-map` | World map page                          |
| `api/[[...route]]/worlddata` | Hono routes for fetching indicator data |

---

## Portfolio Snapshots

Portfolio Snapshots provide historical tracking of total portfolio value over time.

### Schema

```typescript
// convex/schema.ts

portfolioSnapshots: defineTable({
  userId: v.string(),
  timestamp: v.number(),                      // Unix timestamp in ms
  date: v.string(),                           // ISO date (YYYY-MM-DD)

  // Totals
  totalAssets: v.number(),
  totalLiabilities: v.number(),
  netWorth: v.number(),
  totalCostBasis: v.optional(v.number()),

  // Category breakdown
  categoryBreakdown: v.optional(v.array(v.object({
    category: v.string(),                     // "equities", "cash", etc.
    value: v.number(),
    costBasis: v.optional(v.number()),
  }))),

  source: v.string(),                         // "plaid", "snaptrade", "scheduled"
})
  .index("by_user_date", ["userId", "date"])
  .index("by_user_timestamp", ["userId", "timestamp"]),
```

### Snapshot Creation

Snapshots are created:

1. **After syncs**: When Plaid, SnapTrade, or Vezgo data is synced
2. **Scheduled**: Daily via Convex cron jobs
3. **Manual**: When user triggers a portfolio refresh

```typescript
// convex/crons.ts
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Create daily portfolio snapshot at midnight UTC
crons.daily(
  "daily-portfolio-snapshot",
  { hourUTC: 0, minuteUTC: 0 },
  internal.portfolioSnapshots.createAllUsersSnapshots,
);

export default crons;
```

### Key Files

| File                           | Purpose                       |
| ------------------------------ | ----------------------------- |
| `convex/portfolioSnapshots.ts` | Snapshot creation and queries |
| `convex/crons.ts`              | Scheduled snapshot jobs       |
| `hooks/convex/portfolio.ts`    | Portfolio hooks with history  |

---

## Performance Calculation System

The Performance Calculation System provides historical performance data for the portfolio, supporting both discrete (snapshot-based) and continuous (price-based) calculation strategies.

### Overview

Portfolio performance can be calculated in two ways:

1. **Discrete Strategy**: Uses stored portfolio snapshots to display historical values
2. **Continuous Strategy**: Calculates historical values from current holdings + historical prices

The dashboard combines both strategies to provide accurate historical charts even when snapshot data is limited or interpolated.

### Discrete vs Continuous Strategies

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     DISCRETE STRATEGY                                    │
│                                                                          │
│  Uses: Portfolio Snapshots (stored in database)                         │
│  Pro: Reflects actual portfolio composition at each point in time       │
│  Con: Limited to dates when snapshots exist                             │
│  Con: Interpolated values for dates without actual snapshots            │
│                                                                          │
│  Data Points:                                                            │
│  ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐    ┌─────┐                   │
│  │ Jan │    │ Feb │    │ Mar │    │ Apr │    │ May │                   │
│  │ 1st │    │ 1st │    │ 1st │    │ 1st │    │ 1st │                   │
│  │actual    │interp│    │interp│    │actual│    │actual│                   │
│  └─────┘    └─────┘    └─────┘    └─────┘    └─────┘                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                     CONTINUOUS STRATEGY                                  │
│                                                                          │
│  Uses: Current holdings × Historical prices                             │
│  Pro: Smooth price curves showing daily fluctuations                    │
│  Con: Assumes current holdings existed throughout period                │
│                                                                          │
│  Formula:                                                                │
│  Value(t) = Σ(quantity_i × price_i(t) × premium_i)                     │
│                                                                          │
│  Data Points:                                                            │
│  ────────────────────────────────────────────────────────────          │
│  Daily price data provides continuous historical performance             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### Snapshot Source Types

Portfolio snapshots include a `source` field indicating how the data was obtained:

| Source           | Description                                      |
| ---------------- | ------------------------------------------------ |
| `"calculated"`   | Actual snapshot created from sync or cron job    |
| `"interpolated"` | Generated value for dates without real snapshots |
| `"plaid"`        | Snapshot created after Plaid sync                |
| `"snaptrade"`    | Snapshot created after SnapTrade sync            |
| `"vezgo"`        | Snapshot created after Vezgo sync                |
| `"scheduled"`    | Snapshot created by daily cron job               |

The chart logic distinguishes between `"interpolated"` and all other sources to determine if actual historical data exists.

### Chart Data Hybrid Approach

The `usePortfolioChartData` hook combines discrete and continuous strategies:

```typescript
// Decision logic in usePortfolioChartData.ts

1. Fetch discrete snapshots (portfolio history)
2. Fetch continuous price data (metals prices × holdings)
3. Determine first actual (non-interpolated) snapshot timestamp
4. For each date in range:
   a. If date >= firstActualSnapshotTimestamp:
      → Use discrete snapshot value (actual data exists)
   b. If date < firstActualSnapshotTimestamp AND continuous data exists:
      → Use continuous value (calculate from current holdings × historical prices)
   c. If date < firstActualSnapshotTimestamp AND NO continuous data:
      → Don't include data point (portfolio value was 0)
```

```
Timeline Example:
═══════════════════════════════════════════════════════════════════════

Jan 1, 2025                Feb 25, 2025              Feb 1, 2026
    │                           │                         │
    │   No portfolio data       │  Gold coin purchased    │  Broker connected
    │   (value was €0)          │  (use continuous)       │  (use discrete)
    │                           │                         │
    ▼                           ▼                         ▼
────┴───────────────────────────┴─────────────────────────┴────────────►

    [No data points]           [Metals prices ×          [Portfolio
                                holdings = €3,800-4,200]  snapshot = €118k]
```

### Metal Price Conversion

Metal prices from external APIs (e.g., metals.dev) are returned **per troy ounce**, but vault items store quantities in **grams**. The continuous performance calculation must convert:

```typescript
// hooks/performance/useContinuousPerformance.ts

const TROY_OUNCE_TO_GRAMS = 31.1035;

const toPerGram = (pricePerOunce: number): number =>
  pricePerOunce / TROY_OUNCE_TO_GRAMS;

// Value calculation
const value = quantity * toPerGram(pricePerOunce) * (1 + premiumPercent / 100);
```

### Performance Hooks

| Hook                       | Purpose                                                     |
| -------------------------- | ----------------------------------------------------------- |
| `useDiscretePerformance`   | Fetches portfolio snapshots for historical values           |
| `useContinuousPerformance` | Calculates performance from vault items × historical prices |
| `usePortfolioChartData`    | Combines discrete + continuous for dashboard chart          |
| `useNetWorthYTD`           | Calculates year-to-date net worth change with fallback      |
| `usePortfolioYTD`          | Calculates YTD return percentage                            |
| `useCategoryPerformance`   | Category-specific performance (equities, metals, etc.)      |

### YTD Calculation Fallback

When calculating YTD performance, if no portfolio snapshot exists from before January 1st of the current year, the system falls back to continuous performance data:

```typescript
// hooks/performance/usePortfolioYTD.ts

const yearStartValue =
  discreteYearStartValue ?? // From portfolio snapshot
  continuousYearStartValue ?? // From continuous calculation
  0; // No data available
```

### Key Files

| File                                            | Purpose                                     |
| ----------------------------------------------- | ------------------------------------------- |
| `hooks/performance/useDiscretePerformance.ts`   | Snapshot-based performance data             |
| `hooks/performance/useContinuousPerformance.ts` | Price-based continuous performance          |
| `hooks/performance/usePortfolioChartData.ts`    | Hybrid chart data combining both strategies |
| `hooks/performance/usePortfolioYTD.ts`          | YTD calculation with fallback logic         |
| `hooks/performance/types.ts`                    | Shared TypeScript types                     |

### Data Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Dashboard Chart                                  │
│                                                                          │
│                    usePortfolioChartData()                               │
│                            │                                             │
│              ┌─────────────┴─────────────┐                              │
│              ▼                           ▼                              │
│   useDiscretePerformance()    useContinuousPerformance()                │
│              │                           │                              │
│              ▼                           ▼                              │
│   Portfolio Snapshots         Vault Items + Metal Prices                │
│   (Convex DB)                 (Convex + External API)                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Onboarding System

A guided onboarding flow helps new users connect their financial accounts.

### Schema

```typescript
// convex/schema.ts

onboardingProgress: defineTable({
  userId: v.string(),
  currentStep: v.number(),                    // 1-6
  completedSteps: v.array(v.number()),        // [1, 2, 3]
  skippedSteps: v.array(v.number()),          // [3, 4]
  profileCompleted: v.boolean(),
  bankingConnected: v.boolean(),
  brokersConnected: v.boolean(),
  cryptoConnected: v.boolean(),
  onboardingCompleted: v.boolean(),
  completedAt: v.optional(v.number()),
}).index("by_user", ["userId"]),
```

### Onboarding Steps

| Step | Name     | Purpose                                    |
| ---- | -------- | ------------------------------------------ |
| 1    | Welcome  | Introduction to Fiscalis                   |
| 2    | Profile  | Currency preferences, display name         |
| 3    | Banking  | Connect bank accounts via Plaid            |
| 4    | Brokers  | Connect brokerage accounts via SnapTrade   |
| 5    | Crypto   | Connect crypto wallets/exchanges via Vezgo |
| 6    | Complete | Summary and redirect to dashboard          |

### Key Files

| File                                      | Purpose                     |
| ----------------------------------------- | --------------------------- |
| `convex/onboarding.ts`                    | Progress tracking mutations |
| `hooks/convex/onboarding.ts`              | Onboarding hooks            |
| `app/(onboarding)/onboarding/`            | Onboarding page layout      |
| `components/atomic/organisms/onboarding/` | Step components             |

---

## Component Architecture

### Atomic Design Pattern

```
components/atomic/
├── atoms/           # Smallest, indivisible components
│   ├── bankAccountCard.tsx
│   ├── plaidLinkButton.tsx
│   ├── plaidUpdateButton.tsx
│   ├── snaptradeConnectButton.tsx
│   ├── VezgoConnectButton.tsx
│   ├── syncAllButton.tsx
│   ├── brokerAccountCard.tsx
│   ├── brokerConnectionCard.tsx
│   ├── timeSlider.tsx
│   ├── barCharts/
│   ├── pieCharts/
│   ├── cards/
│   │   └── singleKPICard.tsx
│   └── metals/
│
├── molecules/       # Combinations of atoms
│   ├── bankAccountsCard.tsx
│   ├── bankReauthCard.tsx
│   ├── brokerAccountsCard.tsx
│   ├── brokerConnectionsCard.tsx
│   ├── brokerReauthCard.tsx
│   ├── navigationDropdown.tsx
│   ├── navigationPopover.tsx
│   ├── navigationTeamSwitcher.tsx
│   ├── navigationUserMenu.tsx
│   ├── indicatorSearch.tsx        # World Bank indicator search
│   ├── integrations/              # Unified integration cards
│   │   └── IntegrationConnectionCard.tsx
│   ├── investments/
│   │   └── PageHeader.tsx
│   ├── loans/
│   │   └── loan-card.tsx
│   ├── metals/
│   └── crypto/                    # Crypto-specific molecules
│       ├── CryptoConnectionsCard.tsx
│       ├── CryptoPositionsTable.tsx
│       ├── CryptoHoldingsCard.tsx
│       ├── CryptoAllocationChart.tsx
│       ├── CryptoLargestHoldingsCard.tsx
│       └── CryptoTransactionsTable.tsx
│
└── organisms/       # Complex, self-contained sections
    ├── banksCard.tsx
    ├── brokersCard.tsx
    ├── priceChart.tsx             # Metals price charts
    ├── header.tsx
    ├── navigationSidebar.tsx
    ├── navigationSidebarWrapper.tsx
    ├── VezgoConnectModal.tsx
    ├── loans/                     # Loan management organisms
    │   └── add-loan-dialog.tsx
    ├── metals/                    # Metals page organisms
    │   ├── MetalsPage.tsx
    │   └── MetalsInventoryTable.tsx
    └── onboarding/                # Onboarding step components
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
2. **Time-series data** via Hono + Neon PostgreSQL for commodities pricing and economic indicators
3. **Secure storage** with AES-256-GCM encryption for sensitive tokens (Plaid, SnapTrade, Vezgo)
4. **Type safety** from database to UI with TypeScript throughout
5. **Clean separation** between real-time (banking, brokers, crypto) and traditional (metals, world data) patterns
6. **Multi-provider financial aggregation** with Plaid (banking), SnapTrade (brokers), and Vezgo (crypto)
7. **Unified classification system** mapping provider data to 8 investment categories with 50+ subcategories
8. **Manual asset tracking** for loans, precious metals, and other non-connected assets
9. **Historical tracking** via portfolio snapshots with daily cron jobs
10. **Guided onboarding** helping users connect financial accounts step-by-step
11. **Hybrid performance calculation** combining discrete snapshots with continuous price data for accurate historical charts

### Key Design Decisions

- **Convex for user data**: Automatic real-time sync eliminates manual cache invalidation
- **Neon PostgreSQL for time-series**: Traditional SQL better suited for historical price queries
- **Clerk for auth**: Unified authentication across frontend, Convex, and Hono
- **Atomic Design**: Scalable component architecture with clear hierarchy
- **Provider per category**: One financial data provider per asset category (Plaid→banking, SnapTrade→brokers, Vezgo→crypto)
- **Classification at sync time**: Provider data classified to categories immediately upon sync, enabling efficient category-based queries via compound indexes
- **Hybrid manual/automatic**: Users can connect accounts OR manually track assets (loans, metals)
- **Snapshot-based history**: Portfolio value captured daily + after syncs for accurate historical charts
- **Discrete + Continuous performance**: Snapshots provide historical accuracy; continuous prices fill gaps with current holdings × historical prices
- **Metal price conversion**: External APIs return prices per troy ounce, converted to per gram (÷ 31.1035) to match vault item quantities
