# Convex vs Supabase: A Comprehensive Guide

This guide compares Convex and Supabase for the Fiscalis project, including a hybrid architecture approach and migration strategies.

## Table of Contents

1. [Overview Comparison](#overview-comparison)
2. [Feature-by-Feature Analysis](#feature-by-feature-analysis)
3. [Data Flow Comparison](#data-flow-comparison)
4. [When to Use Each](#when-to-use-each)
5. [Hybrid Architecture](#hybrid-architecture)
6. [Migration Guide: Adding Convex](#migration-guide-adding-convex)
7. [Code Examples](#code-examples)
8. [Cost Considerations](#cost-considerations)

---

## Overview Comparison

| Aspect                | Supabase                       | Convex                       |
| --------------------- | ------------------------------ | ---------------------------- |
| **Database**          | PostgreSQL (relational)        | Document-based (proprietary) |
| **Query Language**    | SQL                            | JavaScript/TypeScript        |
| **Real-time**         | Subscriptions (setup required) | Automatic (built-in)         |
| **Backend Functions** | Edge Functions (Deno)          | Functions (Node.js)          |
| **Auth**              | Supabase Auth or Clerk         | Clerk, Auth0, etc.           |
| **Hosting**           | Self-host or Cloud             | Cloud only                   |
| **Open Source**       | Yes                            | No                           |
| **Type Safety**       | Manual + Drizzle/Prisma        | Automatic end-to-end         |

### Quick Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SUPABASE                                          │
│                                                                             │
│  ✅ Full SQL power (aggregations, joins, window functions)                  │
│  ✅ Open source, self-hostable                                              │
│  ✅ PostgreSQL ecosystem (extensions, tools)                                │
│  ✅ Row-level security built-in                                             │
│  ✅ Great for time-series & analytics                                       │
│  ❌ Real-time requires setup                                                │
│  ❌ More boilerplate code                                                   │
│  ❌ Manual cache invalidation                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            CONVEX                                           │
│                                                                             │
│  ✅ Automatic real-time (no setup)                                          │
│  ✅ End-to-end type safety                                                  │
│  ✅ Less boilerplate code                                                   │
│  ✅ Built-in caching & sync                                                 │
│  ✅ Great for collaborative features                                        │
│  ❌ No SQL (limited aggregations)                                           │
│  ❌ Vendor lock-in                                                          │
│  ❌ Cloud only                                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feature-by-Feature Analysis

### 1. Database Queries

#### Simple CRUD

**Supabase (with Drizzle)**

```typescript
// 3 files needed: schema.ts, api function, Hono route
// db/drizzle/schema.ts
export const plaidItems = pgTable("plaid_items", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  accessToken: text("access_token").notNull(),
});

// lib/api/banking.ts
export async function getAccounts() {
  const response = await fetch("/api/banking/accounts");
  return response.json();
}

// app/(api)/api/[[...route]]/banking.ts
.get("/accounts", async (c) => {
  const { userId } = await auth();
  const items = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId));
  return c.json(items);
})
```

**Convex**

```typescript
// 1 file: convex/banking.ts
export const getAccounts = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    return await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

// Component: just use it
const accounts = useQuery(api.banking.getAccounts);
```

#### Complex Aggregations

**Supabase (SQL) ✅ Winner**

```sql
SELECT
  DATE_TRUNC('week', timestamp) as week,
  AVG(gold_eur) as avg_price,
  MIN(gold_eur) as min_price,
  MAX(gold_eur) as max_price,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY gold_eur) as median
FROM precious_metal_prices
WHERE timestamp >= NOW() - INTERVAL '3 months'
GROUP BY DATE_TRUNC('week', timestamp)
ORDER BY week DESC;
```

**Convex (JavaScript) ❌ Verbose**

```typescript
// Must fetch all data and compute in JS
export const getWeeklyPrices = query({
  handler: async (ctx) => {
    const prices = await ctx.db.query("prices").collect();
    // Manual grouping, averaging, etc. in JavaScript
    // Less efficient, more code
  },
});
```

### 2. Real-Time Updates

**Supabase**

```typescript
// Setup required
const channel = supabase
  .channel("prices")
  .on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "prices" },
    (payload) => {
      // Manually update React state
      setPrice(payload.new);
    },
  )
  .subscribe();

// Don't forget to unsubscribe!
return () => supabase.removeChannel(channel);
```

**Convex ✅ Winner**

```typescript
// Automatic - just use the hook!
const prices = useQuery(api.prices.getLatest);
// UI updates automatically when data changes. That's it.
```

### 3. Scheduled Jobs (Cron)

**Supabase Edge Functions**

```typescript
// supabase/functions/fetch-prices/index.ts
Deno.serve(async () => {
  // Fetch prices from API
  // Insert into database
  return new Response("OK");
});

// Schedule in config.toml or Dashboard
// [functions.fetch-prices]
// schedule = "* * * * *"
```

**Convex**

```typescript
// convex/crons.ts
const crons = cronJobs();

crons.interval("fetch-prices", { minutes: 1 }, internal.prices.fetchAndSave);

export default crons;

// convex/prices.ts
export const fetchAndSave = internalAction({
  handler: async (ctx) => {
    const response = await fetch("https://api.goldprice.com/...");
    const data = await response.json();
    await ctx.runMutation(internal.prices.save, { data });
  },
});
```

### 4. Authentication

Both work great with **Clerk**:

**Supabase + Clerk**

```typescript
// In every API route
const { userId } = await auth();
if (!userId) return c.json({ error: "Unauthorized" }, 401);
```

**Convex + Clerk**

```typescript
// convex/convex.config.ts
export default defineApp({
  providers: [{ type: "clerk" }],
});

// In queries/mutations
const identity = await ctx.auth.getUserIdentity();
if (!identity) throw new Error("Unauthorized");
```

---

## Data Flow Comparison

### Current Architecture (Supabase/Neon + Hono)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         CURRENT: SUPABASE FLOW                              │
│                                                                             │
│  Component → useQuery Hook → fetch() → Hono API → Drizzle → PostgreSQL     │
│                                                                             │
│  ┌────────────┐   ┌────────────┐   ┌────────────┐   ┌────────────┐        │
│  │ Component  │──▶│ React Query│──▶│ lib/api/   │──▶│ Hono Route │        │
│  │            │   │ useAccounts│   │ fetch()    │   │ /accounts  │        │
│  └────────────┘   └────────────┘   └────────────┘   └─────┬──────┘        │
│        ▲                                                   │               │
│        │         Manual invalidation needed                ▼               │
│        │◀─────────────────────────────────────────  ┌────────────┐        │
│        │                                            │  Drizzle   │        │
│        │                                            │  → Neon DB │        │
│                                                     └────────────┘        │
│                                                                             │
│  Files: hooks/banking.ts, lib/api/banking.ts, app/(api)/.../banking.ts     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Convex Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CONVEX FLOW                                       │
│                                                                             │
│  Component → useQuery → Convex Function → Convex Database                   │
│                                                                             │
│  ┌────────────┐        ┌─────────────────────┐        ┌────────────┐       │
│  │ Component  │──────▶ │ Convex Query        │──────▶ │  Convex    │       │
│  │            │◀══════ │ (convex/banking.ts) │◀══════ │  Database  │       │
│  └────────────┘        └─────────────────────┘        └────────────┘       │
│        ▲                                                                    │
│        │              Automatic real-time sync                              │
│        ╚════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Files: convex/banking.ts (that's it!)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## When to Use Each

### Use Supabase/PostgreSQL For:

| Use Case                            | Reason                             |
| ----------------------------------- | ---------------------------------- |
| **Time-series data** (metal prices) | SQL aggregations, window functions |
| **Complex analytics**               | GROUP BY, JOINs, CTEs              |
| **Historical data queries**         | Efficient date range queries       |
| **Reporting**                       | Materialized views, rollups        |
| **Data you might export**           | Standard PostgreSQL                |

### Use Convex For:

| Use Case                   | Reason                        |
| -------------------------- | ----------------------------- |
| **Banking dashboard**      | Real-time account updates     |
| **User preferences**       | Simple CRUD with instant sync |
| **Notifications**          | Push updates to all clients   |
| **Collaborative features** | Multiple users see same data  |
| **Chat/messaging**         | Real-time by nature           |

---

## Hybrid Architecture

The recommended approach for Fiscalis: **Use both!**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        HYBRID ARCHITECTURE                                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         FRONTEND (Next.js)                           │   │
│  │                                                                      │   │
│  │   ┌─────────────────────┐       ┌─────────────────────┐            │   │
│  │   │   Banking Features  │       │   Metals/Analytics  │            │   │
│  │   │   (Real-time)       │       │   (Time-series)     │            │   │
│  │   └──────────┬──────────┘       └──────────┬──────────┘            │   │
│  │              │                             │                        │   │
│  └──────────────┼─────────────────────────────┼────────────────────────┘   │
│                 │                             │                             │
│                 ▼                             ▼                             │
│  ┌──────────────────────────┐   ┌──────────────────────────┐              │
│  │         CONVEX           │   │    SUPABASE/NEON         │              │
│  │                          │   │                          │              │
│  │  • plaidItems            │   │  • precious_metal_prices │              │
│  │  • plaidTransactions     │   │  • currency_rates        │              │
│  │  • userPreferences       │   │  • weekly_aggregates     │              │
│  │  • notifications         │   │  • monthly_aggregates    │              │
│  │                          │   │                          │              │
│  │  Real-time sync ✓        │   │  SQL aggregations ✓      │              │
│  │  Simple queries ✓        │   │  Materialized views ✓    │              │
│  └──────────────────────────┘   └──────────────────────────┘              │
│                 │                             │                             │
│                 │                             │                             │
│                 ▼                             ▼                             │
│  ┌──────────────────────────┐   ┌──────────────────────────┐              │
│  │     EXTERNAL: Plaid      │   │   Edge Function (Cron)   │              │
│  │     (via Convex Actions) │   │   Fetch metal prices     │              │
│  └──────────────────────────┘   └──────────────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Ownership

| Data                      | Location | Reason                        |
| ------------------------- | -------- | ----------------------------- |
| Metal prices (raw)        | Supabase | Time-series, SQL aggregations |
| Metal prices (aggregated) | Supabase | Materialized views            |
| Currency rates            | Supabase | Time-series                   |
| Plaid items               | Convex   | Real-time sync to UI          |
| Plaid transactions        | Convex   | Real-time updates             |
| User settings             | Convex   | Instant sync                  |
| Calculator history        | Convex   | Simple CRUD                   |

---

## Migration Guide: Adding Convex

### Phase 1: Setup (Day 1)

#### 1.1 Install Convex

```bash
cd frontend
bun add convex
bunx convex init
```

#### 1.2 Project Structure After

```
frontend/
├── convex/                    # NEW: Convex backend
│   ├── _generated/            # Auto-generated types
│   ├── schema.ts              # Database schema
│   ├── banking.ts             # Banking queries/mutations
│   ├── auth.config.ts         # Clerk integration
│   └── crons.ts               # Scheduled jobs
├── app/
│   ├── (api)/api/[[...route]]/ # KEEP: Metals API (Hono)
│   └── ...
├── db/drizzle/                # KEEP: For metals data
├── hooks/
│   ├── banking.ts             # MIGRATE: To Convex hooks
│   └── metals.ts              # KEEP: Uses Hono API
└── lib/
    ├── api/banking.ts         # DELETE: Replaced by Convex
    └── api/metals.ts          # KEEP: Supabase queries
```

#### 1.3 Configure Clerk with Convex

```typescript
// convex/auth.config.ts
export default {
  providers: [
    {
      domain: process.env.CLERK_ISSUER_URL,
      applicationID: "convex",
    },
  ],
};
```

```tsx
// app/layout.tsx - Add ConvexProvider
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        <QueryProvider>
          {" "}
          {/* Keep for metals/Supabase */}
          {children}
        </QueryProvider>
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

### Phase 2: Schema Migration (Day 1-2)

#### 2.1 Define Convex Schema

```typescript
// convex/schema.ts
import { defineSchema, defineTable, v } from "convex/server";

export default defineSchema({
  // Plaid connection tokens
  plaidItems: defineTable({
    userId: v.string(),
    accessToken: v.string(),
    itemId: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_item", ["itemId"]),

  // Cached transactions
  plaidTransactions: defineTable({
    userId: v.string(),
    plaidTransactionId: v.string(),
    accountId: v.string(),
    amount: v.number(),
    date: v.number(),
    name: v.string(),
    merchantName: v.optional(v.string()),
    category: v.optional(v.string()),
    pending: v.boolean(),
    syncedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_account", ["accountId"])
    .index("by_date", ["userId", "date"]),

  // User preferences
  userPreferences: defineTable({
    userId: v.string(),
    defaultCurrency: v.string(),
    theme: v.string(),
    notifications: v.boolean(),
  }).index("by_user", ["userId"]),
});
```

### Phase 3: Migrate Banking Logic (Day 2-3)

#### 3.1 Create Convex Functions

```typescript
// convex/banking.ts
import { query, mutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

// ============ QUERIES ============

export const getItems = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    return await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();
  },
});

export const getAccounts = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const items = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .collect();

    // Note: Actual Plaid API calls happen in actions
    return items.map((item) => ({
      itemId: item.itemId,
      institutionName: item.institutionName,
      // Accounts are fetched separately via action
    }));
  },
});

export const getTransactions = query({
  args: {
    limit: v.optional(v.number()),
    accountId: v.optional(v.string()),
  },
  handler: async (ctx, { limit = 50, accountId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    let query = ctx.db
      .query("plaidTransactions")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject));

    if (accountId) {
      query = ctx.db
        .query("plaidTransactions")
        .withIndex("by_account", (q) => q.eq("accountId", accountId));
    }

    return await query.order("desc").take(limit);
  },
});

// ============ MUTATIONS ============

export const saveItem = mutation({
  args: {
    accessToken: v.string(),
    itemId: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Check for duplicate
    const existing = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("institutionId"), args.institutionId))
      .first();

    if (existing) {
      throw new Error("You already have a connection to this institution");
    }

    return await ctx.db.insert("plaidItems", {
      userId: identity.subject,
      accessToken: args.accessToken,
      itemId: args.itemId,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const deleteItem = mutation({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const item = await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .first();

    if (!item || item.userId !== identity.subject) {
      throw new Error("Item not found");
    }

    await ctx.db.delete(item._id);
    return { success: true };
  },
});

// ============ ACTIONS (External API Calls) ============

export const createLinkToken = action({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Initialize Plaid client
    const plaidClient = getPlaidClient();

    const response = await plaidClient.linkTokenCreate({
      user: { client_user_id: identity.subject },
      client_name: "Fiscalis",
      products: ["auth", "transactions"],
      country_codes: ["US", "DE", "GB"],
      language: "en",
    });

    return { linkToken: response.data.link_token };
  },
});

export const exchangeToken = action({
  args: {
    publicToken: v.string(),
    institutionId: v.optional(v.string()),
    institutionName: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    const plaidClient = getPlaidClient();

    const response = await plaidClient.itemPublicTokenExchange({
      public_token: args.publicToken,
    });

    // Save to database via mutation
    await ctx.runMutation(internal.banking.saveItem, {
      accessToken: response.data.access_token,
      itemId: response.data.item_id,
      institutionId: args.institutionId,
      institutionName: args.institutionName,
    });

    return { success: true };
  },
});

export const fetchAccountsFromPlaid = action({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthorized");

    // Get access token from DB
    const item = await ctx.runQuery(internal.banking.getItemByItemId, {
      itemId,
    });
    if (!item) throw new Error("Item not found");

    const plaidClient = getPlaidClient();

    try {
      const response = await plaidClient.accountsGet({
        access_token: item.accessToken,
      });

      return {
        accounts: response.data.accounts,
        needsReauth: false,
      };
    } catch (error: any) {
      if (error.response?.data?.error_code === "ITEM_LOGIN_REQUIRED") {
        return {
          accounts: [],
          needsReauth: true,
          errorCode: "ITEM_LOGIN_REQUIRED",
        };
      }
      throw error;
    }
  },
});

// Helper (internal query for actions)
export const getItemByItemId = internalQuery({
  args: { itemId: v.string() },
  handler: async (ctx, { itemId }) => {
    return await ctx.db
      .query("plaidItems")
      .withIndex("by_item", (q) => q.eq("itemId", itemId))
      .first();
  },
});
```

#### 3.2 Update Components to Use Convex

```typescript
// BEFORE: hooks/banking.ts (React Query + fetch)
export function useAccounts() {
  return useQuery({
    queryKey: bankingKeys.accounts(),
    queryFn: bankingApi.getAccounts,
  });
}

// AFTER: Direct Convex usage in component
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

function BankingPage() {
  // Queries - auto-update when data changes!
  const items = useQuery(api.banking.getItems);
  const transactions = useQuery(api.banking.getTransactions, { limit: 50 });

  // Mutations
  const deleteItem = useMutation(api.banking.deleteItem);

  // Actions (for external API calls)
  const createLinkToken = useAction(api.banking.createLinkToken);
  const exchangeToken = useAction(api.banking.exchangeToken);

  const handleDisconnect = async (itemId: string) => {
    await deleteItem({ itemId });
    // No invalidation needed - UI updates automatically!
  };

  return (
    <div>
      {items?.map((item) => (
        <BankCard
          key={item._id}
          item={item}
          onDisconnect={() => handleDisconnect(item.itemId)}
        />
      ))}
    </div>
  );
}
```

### Phase 4: Cleanup (Day 3)

#### Files to Delete

```bash
# Remove old banking API layer (replaced by Convex)
rm frontend/lib/api/banking.ts
rm frontend/app/(api)/api/[[...route]]/banking.ts

# Update route.ts to only export metals
# Keep: frontend/app/(api)/api/[[...route]]/metals.ts
```

#### Files to Keep

```bash
# Keep for metals (Supabase/Neon)
frontend/lib/api/metals.ts
frontend/hooks/metals.ts
frontend/app/(api)/api/[[...route]]/metals.ts
frontend/db/drizzle/  # Schema for metals tables
```

### Phase 5: Data Migration (Optional)

If you have existing data in PostgreSQL:

```typescript
// One-time migration script
// scripts/migrate-to-convex.ts
import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { db } from "../db/drizzle/drizzle";
import { plaidItems, plaidTransactions } from "../db/drizzle/schema";

const convex = new ConvexHttpClient(process.env.CONVEX_URL!);

async function migrate() {
  // Migrate plaid items
  const items = await db.select().from(plaidItems);

  for (const item of items) {
    await convex.mutation(api.banking.migrateItem, {
      userId: item.userId,
      accessToken: item.accessToken,
      itemId: item.itemId,
      institutionId: item.institutionId,
      institutionName: item.institutionName,
      createdAt: item.createdAt.getTime(),
    });
  }

  // Migrate transactions
  const txns = await db.select().from(plaidTransactions);

  for (const txn of txns) {
    await convex.mutation(api.banking.migrateTransaction, {
      userId: txn.userId,
      plaidTransactionId: txn.plaidTransactionId,
      accountId: txn.accountId,
      amount: parseFloat(txn.amount),
      date: txn.date.getTime(),
      name: txn.name,
      merchantName: txn.merchantName,
      category: txn.category,
      pending: txn.pending,
    });
  }

  console.log("Migration complete!");
}

migrate();
```

---

## Code Examples

### Complete Component Example (Hybrid)

```tsx
// app/(root)/dashboard/page.tsx
"use client";

import { useQuery as useConvexQuery } from "convex/react";
import { useQuery as useTanstackQuery } from "@tanstack/react-query";
import { api } from "@/convex/_generated/api";
import * as metalsApi from "@/lib/api/metals";

export default function DashboardPage() {
  // Banking data from Convex (real-time)
  const accounts = useConvexQuery(api.banking.getAccounts);
  const transactions = useConvexQuery(api.banking.getTransactions, {
    limit: 10,
  });

  // Metals data from Supabase (via React Query)
  const { data: goldPrice } = useTanstackQuery({
    queryKey: ["metals", "gold", "latest"],
    queryFn: () => metalsApi.getLatestPrice("gold"),
    refetchInterval: 60000, // Poll every minute
  });

  const { data: weeklyPrices } = useTanstackQuery({
    queryKey: ["metals", "weekly"],
    queryFn: () => metalsApi.getWeeklyPrices(12),
  });

  return (
    <div className="grid grid-cols-2 gap-8">
      {/* Real-time banking section (Convex) */}
      <section>
        <h2>Your Accounts</h2>
        {accounts?.map((account) => (
          <AccountCard key={account._id} account={account} />
        ))}

        <h3>Recent Transactions</h3>
        {transactions?.map((txn) => (
          <TransactionRow key={txn._id} transaction={txn} />
        ))}
      </section>

      {/* Analytics section (Supabase) */}
      <section>
        <h2>Gold Price</h2>
        <p>€{goldPrice?.gold_eur}</p>

        <h3>Weekly Trends</h3>
        <PriceChart data={weeklyPrices} />
      </section>
    </div>
  );
}
```

### Convex Hooks File (Simplified)

```typescript
// hooks/convex-banking.ts
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

// Optional: Create wrapper hooks for cleaner imports
export function useAccounts() {
  return useQuery(api.banking.getAccounts);
}

export function useTransactions(limit?: number) {
  return useQuery(api.banking.getTransactions, { limit: limit ?? 50 });
}

export function useDeleteItem() {
  return useMutation(api.banking.deleteItem);
}

export function usePlaidLink() {
  const createLinkToken = useAction(api.banking.createLinkToken);
  const exchangeToken = useAction(api.banking.exchangeToken);

  return { createLinkToken, exchangeToken };
}
```

---

## Cost Considerations

### Supabase Pricing

| Tier | Price  | Includes                                               |
| ---- | ------ | ------------------------------------------------------ |
| Free | $0     | 500MB DB, 2GB bandwidth, 50K edge function invocations |
| Pro  | $25/mo | 8GB DB, 250GB bandwidth, 2M edge function invocations  |

### Convex Pricing

| Tier | Price  | Includes                                          |
| ---- | ------ | ------------------------------------------------- |
| Free | $0     | 1M function calls, 1GB storage, 1GB bandwidth     |
| Pro  | $25/mo | 25M function calls, 256GB storage, 25GB bandwidth |

### Hybrid Cost Estimate (Your Use Case)

| Service   | Tier     | Cost         | Usage                       |
| --------- | -------- | ------------ | --------------------------- |
| Supabase  | Free/Pro | $0-25        | Metals data, edge functions |
| Convex    | Free     | $0           | Banking data (low volume)   |
| **Total** |          | **$0-25/mo** |                             |

For a personal finance app, the **free tiers of both** should be sufficient for a long time.

---

## Summary: Migration Checklist

- [ ] **Phase 1**: Install Convex, configure with Clerk
- [ ] **Phase 2**: Define Convex schema for banking data
- [ ] **Phase 3**: Migrate banking queries/mutations to Convex
- [ ] **Phase 4**: Update components to use Convex hooks
- [ ] **Phase 5**: Remove old banking API files
- [ ] **Phase 6**: (Optional) Migrate existing data
- [ ] **Keep**: Metals API on Supabase/Hono for SQL power

### Benefits After Migration

| Before (All Supabase)     | After (Hybrid)          |
| ------------------------- | ----------------------- |
| Manual cache invalidation | Auto-sync for banking   |
| 4 files per feature       | 1 file per feature      |
| Polling for updates       | Real-time banking       |
| Complex aggregations ✅   | Complex aggregations ✅ |
| More code                 | Less code               |

---

## Resources

- [Convex Documentation](https://docs.convex.dev/)
- [Convex + Clerk Integration](https://docs.convex.dev/auth/clerk)
- [Supabase Documentation](https://supabase.com/docs)
- [TimescaleDB for Time-Series](https://docs.timescale.com/)
