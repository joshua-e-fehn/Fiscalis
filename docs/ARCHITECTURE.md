# Fiscalis Architecture Guide

This document provides a comprehensive overview of the Fiscalis application architecture, explaining the relationships between different components, data flows, and design patterns used throughout the codebase.

## Table of Contents

1. [High-Level Overview](#high-level-overview)
2. [Repository Structure](#repository-structure)
3. [Technology Stack](#technology-stack)
4. [Data Flow Architecture](#data-flow-architecture)
5. [API Layer (Hono)](#api-layer-hono)
6. [Database Layer (Drizzle + Neon)](#database-layer-drizzle--neon)
7. [Client-Side Data Management](#client-side-data-management)
8. [Authentication Flow (Clerk)](#authentication-flow-clerk)
9. [External Integrations](#external-integrations)
10. [Component Architecture](#component-architecture)

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
│  │  │                    React Query (TanStack Query)                      │   ││
│  │  │  ┌─────────────────────┐    ┌─────────────────────┐                 │   ││
│  │  │  │   hooks/banking.ts  │    │   hooks/metals.ts   │                 │   ││
│  │  │  │  - useAccounts()    │    │  - useMetalPrices() │                 │   ││
│  │  │  │  - useTransactions()│    │  - useMetalLatest() │                 │   ││
│  │  │  │  - usePlaidLink()   │    │                     │                 │   ││
│  │  │  └─────────┬───────────┘    └──────────┬──────────┘                 │   ││
│  │  └────────────┼───────────────────────────┼────────────────────────────┘   ││
│  │               │                           │                                 ││
│  │               ▼                           ▼                                 ││
│  │  ┌─────────────────────────────────────────────────────────────────────┐   ││
│  │  │                       lib/api/ (Fetch Wrappers)                      │   ││
│  │  │  ┌─────────────────────┐    ┌─────────────────────┐                 │   ││
│  │  │  │  lib/api/banking.ts │    │  lib/api/metals.ts  │                 │   ││
│  │  │  └─────────┬───────────┘    └──────────┬──────────┘                 │   ││
│  │  └────────────┼───────────────────────────┼────────────────────────────┘   ││
│  └───────────────┼───────────────────────────┼─────────────────────────────────┘│
│                  │                           │                                   │
│                  ▼                           ▼                                   │
│  ┌─────────────────────────────────────────────────────────────────────────────┐│
│  │                    API Routes (Hono on Edge Runtime)                        ││
│  │                     app/(api)/api/[[...route]]/                             ││
│  │  ┌─────────────────────┐    ┌─────────────────────┐                        ││
│  │  │     banking.ts      │    │      metals.ts      │                        ││
│  │  │  /api/banking/*     │    │   /api/metals/*     │                        ││
│  │  └─────────┬───────────┘    └──────────┬──────────┘                        ││
│  └────────────┼───────────────────────────┼────────────────────────────────────┘│
└───────────────┼───────────────────────────┼─────────────────────────────────────┘
                │                           │
                ▼                           ▼
┌───────────────────────────┐    ┌─────────────────────────────────────────────────┐
│      External APIs        │    │                  DATABASE                        │
│  ┌─────────────────────┐  │    │  ┌─────────────────────────────────────────────┐│
│  │      Plaid API      │  │    │  │              Neon PostgreSQL                ││
│  │  - Link Tokens      │  │    │  │  ┌─────────────────────────────────────────┐││
│  │  - Accounts         │  │    │  │  │          Drizzle ORM                    │││
│  │  - Transactions     │  │    │  │  │  - precious_metal_prices                │││
│  │  - Auth/Identity    │  │    │  │  │  - currency_exchange_rates              │││
│  └─────────────────────┘  │    │  │  │  - plaid_items                          │││
└───────────────────────────┘    │  │  │  - plaid_transactions                   │││
                                 │  │  └─────────────────────────────────────────┘││
                                 │  └─────────────────────────────────────────────┘│
                                 └─────────────────────────────────────────────────┘
```

---

## Repository Structure

```
Fiscalis/
├── frontend/                      # Next.js 16 Application
│   ├── app/                       # App Router pages and API routes
│   │   ├── (api)/                 # API route group
│   │   │   └── api/[[...route]]/  # Hono catch-all route
│   │   │       ├── route.ts       # Hono app setup & exports
│   │   │       ├── banking.ts     # Banking/Plaid endpoints
│   │   │       └── metals.ts      # Precious metals endpoints
│   │   ├── (auth)/                # Auth pages (sign-in, sign-up)
│   │   ├── (root)/                # Protected app pages
│   │   │   ├── dashboard/
│   │   │   ├── banking/
│   │   │   ├── commodities/
│   │   │   └── calculator/
│   │   └── (website)/             # Public marketing pages
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
│   ├── db/                        # Database configuration
│   │   └── drizzle/
│   │       ├── drizzle.ts         # DB connection setup
│   │       └── schema.ts          # Table definitions
│   │
│   ├── hooks/                     # React Query hooks
│   │   ├── banking.ts             # Banking data hooks
│   │   └── metals.ts              # Metals data hooks
│   │
│   ├── lib/                       # Utilities and helpers
│   │   ├── api/                   # API fetch functions
│   │   │   ├── banking.ts
│   │   │   └── metals.ts
│   │   ├── types/                 # TypeScript type definitions
│   │   │   ├── banking.ts
│   │   │   └── metals.ts
│   │   ├── hono.ts                # Hono client setup
│   │   ├── plaid.ts               # Plaid client setup
│   │   └── utils.ts               # General utilities
│   │
│   ├── providers/                 # React Context Providers
│   │   └── queryProvider.tsx      # TanStack Query provider
│   │
│   └── proxy.ts                   # Next.js 16 Proxy (formerly middleware)
│
├── services/                      # Shared services (frontend + backend)
│   └── finance/
│       └── financeService.ts      # Financial calculations
│
└── backend/                       # Backend services
    └── edge_functions/            # Supabase Edge Functions
        └── supabase/
            └── functions/         # Serverless functions
```

---

## Technology Stack

| Layer         | Technology           | Purpose                          |
| ------------- | -------------------- | -------------------------------- |
| **Framework** | Next.js 16           | React framework with App Router  |
| **Runtime**   | Edge Runtime         | Serverless edge functions        |
| **API**       | Hono                 | Lightweight, fast web framework  |
| **Database**  | Neon PostgreSQL      | Serverless Postgres              |
| **ORM**       | Drizzle              | Type-safe SQL ORM                |
| **Auth**      | Clerk                | Authentication & user management |
| **State**     | TanStack Query       | Server state management          |
| **UI**        | shadcn/ui + Tailwind | Component library                |
| **Banking**   | Plaid                | Bank account integration         |

---

## Data Flow Architecture

### Request Flow (Read Operation)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                              CLIENT SIDE                                      │
│                                                                               │
│  1. Component renders          2. Hook called              3. API fn called   │
│  ┌─────────────────┐          ┌─────────────────┐         ┌─────────────────┐│
│  │   <BankingPage> │ ──────▶  │  useAccounts()  │ ──────▶ │  getAccounts()  ││
│  │   Component     │          │  (React Query)  │         │  (lib/api)      ││
│  └─────────────────┘          └─────────────────┘         └────────┬────────┘│
│                                                                     │         │
└─────────────────────────────────────────────────────────────────────┼─────────┘
                                                                      │
                                    HTTP Request: GET /api/banking/accounts
                                                                      │
┌─────────────────────────────────────────────────────────────────────┼─────────┐
│                              SERVER SIDE                            ▼         │
│                                                                               │
│  4. Hono route handler         5. Auth check              6. DB Query        │
│  ┌─────────────────┐          ┌─────────────────┐         ┌─────────────────┐│
│  │  .get("/accounts")│ ──────▶│  await auth()   │ ──────▶ │  db.select()    ││
│  │  (banking.ts)   │          │  (Clerk)        │         │  (Drizzle)      ││
│  └─────────────────┘          └─────────────────┘         └────────┬────────┘│
│                                                                     │         │
│                               7. External API                       ▼         │
│                              ┌─────────────────┐         ┌─────────────────┐ │
│                              │ plaidClient     │ ◀────── │  plaidItems     │ │
│                              │ .accountsGet()  │         │  (access_token) │ │
│                              └────────┬────────┘         └─────────────────┘ │
│                                       │                                       │
└───────────────────────────────────────┼───────────────────────────────────────┘
                                        │
                                        ▼
                              JSON Response to Client
```

### Data Flow Layers Explained

#### Layer 1: React Components

```tsx
// app/(root)/banking/page.tsx
export default function BankingPage() {
  const { data: accounts, isLoading } = useAccounts();

  return <AccountsList accounts={accounts} />;
}
```

#### Layer 2: React Query Hooks (`hooks/`)

```typescript
// hooks/banking.ts
export function useAccounts() {
  return useQuery({
    queryKey: bankingKeys.accounts(), // Cache key
    queryFn: bankingApi.getAccounts, // Data fetcher
    staleTime: 5 * 60 * 1000, // Cache duration
    select: (data) => data.accounts, // Transform response
  });
}
```

#### Layer 3: API Functions (`lib/api/`)

```typescript
// lib/api/banking.ts
export async function getAccounts() {
  const response = await fetch("/api/banking/accounts");
  if (!response.ok) throw new Error("Failed to fetch accounts");
  return response.json();
}
```

#### Layer 4: Hono Route Handlers (`app/(api)/`)

```typescript
// app/(api)/api/[[...route]]/banking.ts
const app = new Hono().get("/accounts", async (c) => {
  const { userId } = await auth();
  // ... fetch from Plaid + DB
  return c.json({ accounts });
});
```

#### Layer 5: Database (Drizzle)

```typescript
// Query plaid items from database
const items = await db
  .select()
  .from(plaidItems)
  .where(eq(plaidItems.userId, userId));
```

---

## API Layer (Hono)

### Why Hono?

- **Edge-first**: Designed for edge runtimes (Cloudflare, Vercel Edge)
- **Type-safe**: Full TypeScript support with end-to-end type inference
- **Fast**: Minimal overhead, excellent performance
- **Familiar**: Express-like API

### Route Structure

```typescript
// app/(api)/api/[[...route]]/route.ts
import { Hono } from "hono";
import { handle } from "hono/vercel";

import banking from "./banking";
import metals from "./metals";

export const runtime = "edge";

const app = new Hono().basePath("/api");

const routes = app
  .route("/banking", banking) // /api/banking/*
  .route("/metals", metals); // /api/metals/*

export const GET = handle(app);
export const POST = handle(app);

// Type export for client-side type inference
export type AppType = typeof routes;
```

### Banking Routes

| Method | Endpoint                            | Purpose                                |
| ------ | ----------------------------------- | -------------------------------------- |
| POST   | `/api/banking/create-link-token`    | Generate Plaid Link token              |
| POST   | `/api/banking/exchange-token`       | Exchange public token for access token |
| GET    | `/api/banking/accounts`             | Get all linked bank accounts           |
| GET    | `/api/banking/auth/:itemId?`        | Get account/routing numbers            |
| GET    | `/api/banking/identity/:itemId?`    | Get account holder identity            |
| GET    | `/api/banking/transactions`         | Get transactions from Plaid            |
| GET    | `/api/banking/transactions/db`      | Get cached transactions from DB        |
| GET    | `/api/banking/balances/summary`     | Get aggregated balance summary         |
| POST   | `/api/banking/transactions/refresh` | Sync latest transactions               |

### Metals Routes

| Method | Endpoint                               | Purpose                             |
| ------ | -------------------------------------- | ----------------------------------- |
| GET    | `/api/metals/:metal/prices/latest`     | Get latest price for a metal        |
| GET    | `/api/metals/:metal/prices/historical` | Get historical prices by time range |
| GET    | `/api/metals/:metal/prices/range`      | Get prices for custom date range    |

---

## Database Layer (Drizzle + Neon)

### Connection Setup

```typescript
// db/drizzle/drizzle.ts
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

### Schema Definitions

```typescript
// db/drizzle/schema.ts

// Precious metal prices (updated regularly by edge function)
export const precious_metal_prices = pgTable("precious_metal_prices", {
  timestamp: timestamp("timestamp").primaryKey(),
  gold_eur: numeric("gold_eur"),
  gold_usd: numeric("gold_usd"),
  silver_eur: numeric("silver_eur"),
  silver_usd: numeric("silver_usd"),
  // ... platinum, palladium
});

// Plaid connection tokens (per user)
export const plaidItems = pgTable("plaid_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(), // Clerk user ID
  accessToken: text("access_token").notNull(),
  itemId: text("item_id").notNull(),
  institutionId: text("institution_id"),
  institutionName: text("institution_name"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Cached transactions
export const plaidTransactions = pgTable("plaid_transactions", {
  id: serial("id").primaryKey(),
  plaidTransactionId: text("plaid_transaction_id").notNull(),
  userId: text("user_id").notNull(),
  accountId: text("account_id").notNull(),
  amount: numeric("amount"),
  date: timestamp("date"),
  name: text("name"),
  // ... more fields
});
```

### Entity Relationship Diagram

```
┌─────────────────────────────┐
│    precious_metal_prices    │
├─────────────────────────────┤
│ PK timestamp                │
│    gold_eur, gold_usd       │
│    silver_eur, silver_usd   │
│    platinum_eur, platinum_usd│
│    palladium_eur, palladium_usd│
└─────────────────────────────┘

┌─────────────────────────────┐
│   currency_exchange_rates   │
├─────────────────────────────┤
│ PK timestamp                │
│    from_eur_to_usd          │
└─────────────────────────────┘

┌─────────────────────────────┐         ┌─────────────────────────────┐
│        plaid_items          │         │     plaid_transactions      │
├─────────────────────────────┤         ├─────────────────────────────┤
│ PK id                       │         │ PK id                       │
│    user_id ─────────────────┼────┬────│    user_id                  │
│    access_token             │    │    │    plaid_transaction_id     │
│    item_id                  │    │    │    account_id               │
│    institution_id           │    │    │    amount, date, name       │
│    institution_name         │    │    │    merchant_name, category  │
│    created_at, updated_at   │    │    │    pending                  │
└─────────────────────────────┘    │    │    synced_at, updated_at    │
                                   │    └─────────────────────────────┘
                                   │
                              Both reference Clerk userId
```

---

## Client-Side Data Management

### TanStack Query Setup

```tsx
// providers/queryProvider.tsx
export default function QueryProvider({ children }: Props) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute default
      },
    },
  });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
```

### Query Key Pattern

```typescript
// hooks/banking.ts
export const bankingKeys = {
  all: ["banking"] as const,
  accounts: () => [...bankingKeys.all, "accounts"] as const,
  account: (id: string) => [...bankingKeys.accounts(), id] as const,
  transactions: () => [...bankingKeys.all, "transactions"] as const,
  transactionsDb: (limit?: number) =>
    [...bankingKeys.transactions(), "db", limit] as const,
  balances: () => [...bankingKeys.all, "balances"] as const,
};
```

### Mutation Flow (Write Operation)

```
User clicks "Connect Bank"
         │
         ▼
┌─────────────────────┐
│  useLinkToken()     │  ──▶  POST /api/banking/create-link-token
│  mutation           │       Returns: { linkToken }
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Plaid Link Modal   │  ──▶  User authenticates with bank
│  Opens              │       Returns: public_token
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  useExchangeToken() │  ──▶  POST /api/banking/exchange-token
│  mutation           │       Stores access_token in DB
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  queryClient        │  ──▶  Invalidate ['banking', 'accounts']
│  .invalidateQueries │       Triggers refetch
└─────────────────────┘
```

---

## Authentication Flow (Clerk)

### Proxy (Edge Middleware)

```typescript
// proxy.ts (formerly middleware.ts)
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher(["/", "/sign-in(.*)", "/sign-up(.*)"]);

export const proxy = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect(); // Redirect to sign-in if not authenticated
  }
});
```

### Server-Side Auth Check

```typescript
// In Hono route handlers
import { auth } from "@clerk/nextjs/server";

.get("/accounts", async (c) => {
  const { userId } = await auth();  // Get authenticated user

  if (!userId) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  // userId is used to scope data queries
  const items = await db.select()
    .from(plaidItems)
    .where(eq(plaidItems.userId, userId));
});
```

---

## External Integrations

### Plaid Integration

```typescript
// lib/plaid.ts
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

const configuration = new Configuration({
  basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID,
      "PLAID-SECRET": process.env.PLAID_SECRET,
    },
  },
});

export const plaidClient = new PlaidApi(configuration);
```

### Plaid Link Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                            PLAID LINK FLOW                               │
│                                                                          │
│   Frontend                    Backend                     Plaid          │
│   ─────────                   ───────                     ─────          │
│       │                          │                          │            │
│       │  1. Create Link Token    │                          │            │
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
│       │  4. Exchange Token       │                          │            │
│       │ ────────────────────────▶│                          │            │
│       │  { publicToken }         │ 5. itemPublicTokenExchange│           │
│       │                          │ ────────────────────────▶│            │
│       │                          │◀──────────────────────── │            │
│       │                          │    { access_token }      │            │
│       │                          │                          │            │
│       │                          │ 6. Store in plaid_items  │            │
│       │                          │ ───────▶ DB              │            │
│       │                          │                          │            │
│       │◀──────────────────────── │                          │            │
│       │    { success: true }     │                          │            │
│       │                          │                          │            │
└───────┴──────────────────────────┴──────────────────────────┴────────────┘
```

---

## Component Architecture

### Atomic Design Pattern

```
components/atomic/
├── atoms/           # Smallest, indivisible components
│   ├── bankAccountCard.tsx
│   ├── plaidLinkButton.tsx
│   ├── cards/
│   │   └── singleKPICard.tsx
│   ├── pieCharts/
│   │   └── donutWithText.tsx
│   └── barCharts/
│
├── molecules/       # Combinations of atoms
│   ├── bankAccountsCard.tsx    # Multiple bankAccountCard atoms
│   ├── navigationDropdown.tsx
│   └── navigationPopover.tsx
│
└── organisms/       # Complex, self-contained sections
    ├── banksCard.tsx           # Full banking overview section
    ├── priceChart.tsx          # Complete price chart with controls
    ├── header.tsx
    └── navigationSidebar.tsx
```

### Component → Hook → API Relationship

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
                                      │ uses
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              HOOK LAYER                                  │
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐                       │
│  │   useAccounts()     │  │   usePlaidLink()    │                       │
│  │   useBalances()     │  │   useExchangeToken()│                       │
│  └──────────┬──────────┘  └──────────┬──────────┘                       │
│             │                        │                                   │
└─────────────┼────────────────────────┼───────────────────────────────────┘
              │ calls                  │ calls
              ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              API LAYER                                   │
│                                                                          │
│  ┌─────────────────────┐  ┌─────────────────────┐                       │
│  │   getAccounts()     │  │   getLinkToken()    │                       │
│  │   getBalances()     │  │   exchangeToken()   │                       │
│  └──────────┬──────────┘  └──────────┬──────────┘                       │
│             │                        │                                   │
└─────────────┼────────────────────────┼───────────────────────────────────┘
              │ fetch                  │ fetch
              ▼                        ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           HONO ROUTES                                    │
│                                                                          │
│  GET /api/banking/accounts     POST /api/banking/create-link-token      │
│  GET /api/banking/balances     POST /api/banking/exchange-token         │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Summary

The Fiscalis architecture follows a clean separation of concerns:

1. **Components** handle UI rendering and user interactions
2. **Hooks** manage server state with React Query (caching, refetching, mutations)
3. **API functions** provide typed fetch wrappers
4. **Hono routes** handle HTTP requests on the edge
5. **Drizzle ORM** provides type-safe database access
6. **External APIs** (Plaid) provide banking data

This layered approach ensures:

- Type safety from database to UI
- Efficient caching and data synchronization
- Clear separation of concerns
- Easy testing and maintenance
- Optimal performance with edge runtime
