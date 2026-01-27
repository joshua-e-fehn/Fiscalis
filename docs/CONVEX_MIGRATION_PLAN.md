# Convex Migration Plan

This document outlines the step-by-step implementation plan for adding Convex to Fiscalis in a hybrid architecture alongside Supabase/Neon.

## Implementation Status

| Phase | Description              | Status             |
| ----- | ------------------------ | ------------------ |
| 1     | Setup & Infrastructure   | ✅ Complete        |
| 2     | Schema & Encryption      | ✅ Complete        |
| 3     | Banking Convex Functions | ✅ Complete        |
| 4     | Broker Convex Functions  | ✅ Complete        |
| 5     | Data Migration Scripts   | ✅ Complete        |
| 6     | Frontend Hooks           | ✅ Complete        |
| 7     | Cleanup (Old APIs)       | ✅ Complete        |
| 8     | Testing                  | ⏸️ Manual verified |
| 9     | Documentation            | ✅ Complete        |

> **Migration Completed**: January 27, 2026
>
> **Summary**: Successfully migrated banking (Plaid) and broker data to Convex.
>
> - 3 Plaid items migrated with encrypted access tokens
> - Frontend components updated to use Convex hooks
> - Legacy Hono routes and React Query hooks removed
> - Only `/api/metals/*` routes remain in Hono (for time-series data)

## Overview

**Goal**: Migrate banking (Plaid) and broker data to Convex while keeping time-series data (metal prices, currency rates) in Supabase.

**Key Decisions**:

- ✅ Migrate existing Plaid/broker data from Neon to Convex
- ✅ Implement application-level encryption for sensitive data (access tokens)
- ⏸️ Vault, Loans, and SnapTrade features deferred to future implementation

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         HYBRID ARCHITECTURE                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   CONVEX (Real-time, User Data)          SUPABASE/NEON (Time-series)        │
│   ─────────────────────────────          ────────────────────────────       │
│   • plaidItems                           • precious_metal_prices             │
│   • plaidAccounts (cached)               • currency_exchange_rates           │
│   • plaidTransactions                                                        │
│   • brokerConnections                                                        │
│   • brokerPositions                                                          │
│   • userSettings                                                             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Setup & Infrastructure

### 1.1 Install Convex

- [ ] Install Convex package

  ```bash
  cd frontend
  bun add convex
  ```

- [ ] Initialize Convex project

  ```bash
  bunx convex init
  ```

  - This creates the `convex/` folder
  - Follow prompts to log in and create a project

### 1.2 Configure Clerk JWT Template

- [ ] Go to [Clerk Dashboard → JWT Templates](https://dashboard.clerk.com/last-active?path=jwt-templates)
- [ ] Click "New template" → Select "Convex"
- [ ] **Important**: Keep the name as `convex` (do not rename)
- [ ] Copy the **Issuer URL** (format: `https://verb-noun-00.clerk.accounts.dev`)
- [ ] Save the template

### 1.3 Add Environment Variables

- [ ] Add to `frontend/.env.local`:

  ```env
  # Convex
  NEXT_PUBLIC_CONVEX_URL=<your-convex-deployment-url>

  # Clerk JWT Issuer for Convex
  CLERK_JWT_ISSUER_DOMAIN=<your-clerk-issuer-url>

  # Encryption key for sensitive data (generate a 32-byte key)
  CONVEX_ENCRYPTION_KEY=<generate-32-byte-base64-key>
  ```

- [ ] Generate encryption key:

  ```bash
  openssl rand -base64 32
  ```

- [ ] Add `CLERK_JWT_ISSUER_DOMAIN` to Convex Dashboard:
  - Go to [Convex Dashboard](https://dashboard.convex.dev)
  - Select your project → Settings → Environment Variables
  - Add `CLERK_JWT_ISSUER_DOMAIN` with your Clerk issuer URL

### 1.4 Create Convex Auth Configuration

- [ ] Create `frontend/convex/auth.config.ts`:

  ```typescript
  import { AuthConfig } from "convex/server";

  export default {
    providers: [
      {
        domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
        applicationID: "convex",
      },
    ],
  } satisfies AuthConfig;
  ```

### 1.5 Create Convex Client Provider

- [ ] Create `frontend/components/ConvexClientProvider.tsx`:

  ```typescript
  "use client";

  import { ReactNode } from "react";
  import { ConvexReactClient } from "convex/react";
  import { ConvexProviderWithClerk } from "convex/react-clerk";
  import { useAuth } from "@clerk/nextjs";

  if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
    throw new Error("Missing NEXT_PUBLIC_CONVEX_URL in environment variables");
  }

  const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL);

  export function ConvexClientProvider({ children }: { children: ReactNode }) {
    return (
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    );
  }
  ```

### 1.6 Update Root Layout

- [ ] Modify `frontend/app/layout.tsx` to include Convex provider:

  ```typescript
  // Add import
  import { ConvexClientProvider } from "@/components/ConvexClientProvider";

  // Wrap children (inside ClerkProvider)
  <ClerkProvider>
    <ConvexClientProvider>
      {/* existing providers and children */}
    </ConvexClientProvider>
  </ClerkProvider>
  ```

### 1.7 Deploy Initial Configuration

- [ ] Run Convex dev to sync configuration:

  ```bash
  bunx convex dev
  ```

  - Keep this running in a separate terminal during development

---

## Phase 2: Convex Schema & Encryption

### 2.1 Create Encryption Utility

- [ ] Create `frontend/convex/lib/encryption.ts`:

  ```typescript
  // Note: Convex actions run in Node.js, so we can use crypto
  import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

  const ALGORITHM = "aes-256-gcm";
  const IV_LENGTH = 16;
  const AUTH_TAG_LENGTH = 16;

  export function encrypt(text: string, key: string): string {
    const keyBuffer = Buffer.from(key, "base64");
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(text, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encryptedData (all base64)
    return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
  }

  export function decrypt(encryptedText: string, key: string): string {
    const keyBuffer = Buffer.from(key, "base64");
    const [ivBase64, authTagBase64, encrypted] = encryptedText.split(":");

    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    const decipher = createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  }
  ```

### 2.2 Create Convex Schema

- [ ] Create `frontend/convex/schema.ts`:

  ```typescript
  import { defineSchema, defineTable, v } from "convex/server";

  export default defineSchema({
    // ═══════════════════════════════════════════════════════════════
    // BANKING (Plaid)
    // ═══════════════════════════════════════════════════════════════

    plaidItems: defineTable({
      userId: v.string(),
      accessToken: v.string(), // Encrypted
      itemId: v.string(),
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
      officialName: v.optional(v.string()),
      type: v.string(),
      subtype: v.optional(v.string()),
      mask: v.optional(v.string()),
      currentBalance: v.optional(v.number()),
      availableBalance: v.optional(v.number()),
      currency: v.string(),
      lastSynced: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_item", ["itemId"])
      .index("by_account", ["accountId"]),

    plaidTransactions: defineTable({
      userId: v.string(),
      accountId: v.string(),
      plaidTransactionId: v.string(),
      amount: v.number(),
      date: v.string(),
      name: v.string(),
      merchantName: v.optional(v.string()),
      category: v.optional(v.string()),
      pending: v.boolean(),
      syncedAt: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_account", ["accountId"])
      .index("by_date", ["userId", "date"])
      .index("by_plaid_id", ["plaidTransactionId"]),

    // ═══════════════════════════════════════════════════════════════
    // BROKERS
    // ═══════════════════════════════════════════════════════════════

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
    })
      .index("by_user", ["userId"])
      .index("by_status", ["userId", "status"]),

    brokerPositions: defineTable({
      userId: v.string(),
      connectionId: v.id("brokerConnections"),
      symbol: v.string(),
      name: v.optional(v.string()),
      quantity: v.number(),
      averageCost: v.optional(v.number()),
      currentPrice: v.optional(v.number()),
      marketValue: v.optional(v.number()),
      unrealizedPnl: v.optional(v.number()),
      currency: v.string(),
      assetType: v.optional(v.string()),
      lastUpdated: v.number(),
    })
      .index("by_user", ["userId"])
      .index("by_connection", ["connectionId"])
      .index("by_symbol", ["userId", "symbol"]),

    // ═══════════════════════════════════════════════════════════════
    // USER SETTINGS
    // ═══════════════════════════════════════════════════════════════

    userSettings: defineTable({
      userId: v.string(),
      defaultCurrency: v.string(),
      theme: v.union(
        v.literal("light"),
        v.literal("dark"),
        v.literal("system"),
      ),
      dashboardLayout: v.optional(v.any()),
      createdAt: v.number(),
      updatedAt: v.number(),
    }).index("by_user", ["userId"]),
  });
  ```

### 2.3 Deploy Schema

- [ ] Ensure `bunx convex dev` is running to sync the schema
- [ ] Verify tables are created in Convex Dashboard → Data

---

## Phase 3: Banking Convex Functions

### 3.1 Create Banking Queries

- [ ] Create `frontend/convex/banking.ts`:

  ```typescript
  import { v } from "convex/values";
  import {
    query,
    mutation,
    action,
    internalMutation,
    internalQuery,
  } from "./_generated/server";
  import { internal } from "./_generated/api";

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  export const getItems = query({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      return await ctx.db
        .query("plaidItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    },
  });

  export const getAccounts = query({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      return await ctx.db
        .query("plaidAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    },
  });

  export const getAccountsByItem = query({
    args: { itemId: v.string() },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      return await ctx.db
        .query("plaidAccounts")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .collect();
    },
  });

  export const getTransactions = query({
    args: {
      limit: v.optional(v.number()),
      accountId: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      let query = ctx.db
        .query("plaidTransactions")
        .withIndex("by_user", (q) => q.eq("userId", userId));

      const transactions = await query.collect();

      // Filter by account if specified
      let filtered = args.accountId
        ? transactions.filter((t) => t.accountId === args.accountId)
        : transactions;

      // Sort by date descending
      filtered.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      // Apply limit
      if (args.limit) {
        filtered = filtered.slice(0, args.limit);
      }

      return filtered;
    },
  });

  export const getBalancesSummary = query({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      const accounts = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const summary = {
        totalBalance: 0,
        totalAvailable: 0,
        accountCount: accounts.length,
        byType: {} as Record<string, { balance: number; count: number }>,
      };

      for (const account of accounts) {
        const balance = account.currentBalance ?? 0;
        const available = account.availableBalance ?? 0;

        summary.totalBalance += balance;
        summary.totalAvailable += available;

        if (!summary.byType[account.type]) {
          summary.byType[account.type] = { balance: 0, count: 0 };
        }
        summary.byType[account.type].balance += balance;
        summary.byType[account.type].count += 1;
      }

      return summary;
    },
  });

  export const getItemsNeedingReauth = query({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      const items = await ctx.db
        .query("plaidItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      return items.filter(
        (item) => item.status === "error" || item.status === "pending_reauth",
      );
    },
  });
  ```

### 3.2 Create Banking Mutations

- [ ] Add to `frontend/convex/banking.ts`:

  ```typescript
  // ═══════════════════════════════════════════════════════════════
  // MUTATIONS (Internal - called by actions)
  // ═══════════════════════════════════════════════════════════════

  export const saveItem = internalMutation({
    args: {
      userId: v.string(),
      accessToken: v.string(),
      itemId: v.string(),
      institutionId: v.optional(v.string()),
      institutionName: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const now = Date.now();

      // Check if item already exists
      const existing = await ctx.db
        .query("plaidItems")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          accessToken: args.accessToken,
          status: "active",
          errorCode: undefined,
          updatedAt: now,
        });
        return existing._id;
      }

      return await ctx.db.insert("plaidItems", {
        userId: args.userId,
        accessToken: args.accessToken,
        itemId: args.itemId,
        institutionId: args.institutionId,
        institutionName: args.institutionName,
        status: "active",
        createdAt: now,
        updatedAt: now,
      });
    },
  });

  export const updateItemStatus = internalMutation({
    args: {
      itemId: v.string(),
      status: v.union(
        v.literal("active"),
        v.literal("error"),
        v.literal("pending_reauth"),
      ),
      errorCode: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const item = await ctx.db
        .query("plaidItems")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .first();

      if (!item) throw new Error("Item not found");

      await ctx.db.patch(item._id, {
        status: args.status,
        errorCode: args.errorCode,
        updatedAt: Date.now(),
      });
    },
  });

  export const saveAccounts = internalMutation({
    args: {
      userId: v.string(),
      itemId: v.string(),
      accounts: v.array(
        v.object({
          accountId: v.string(),
          name: v.string(),
          officialName: v.optional(v.string()),
          type: v.string(),
          subtype: v.optional(v.string()),
          mask: v.optional(v.string()),
          currentBalance: v.optional(v.number()),
          availableBalance: v.optional(v.number()),
          currency: v.string(),
        }),
      ),
    },
    handler: async (ctx, args) => {
      const now = Date.now();

      for (const account of args.accounts) {
        const existing = await ctx.db
          .query("plaidAccounts")
          .withIndex("by_account", (q) => q.eq("accountId", account.accountId))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            ...account,
            lastSynced: now,
          });
        } else {
          await ctx.db.insert("plaidAccounts", {
            userId: args.userId,
            itemId: args.itemId,
            ...account,
            lastSynced: now,
          });
        }
      }
    },
  });

  export const saveTransactions = internalMutation({
    args: {
      userId: v.string(),
      transactions: v.array(
        v.object({
          accountId: v.string(),
          plaidTransactionId: v.string(),
          amount: v.number(),
          date: v.string(),
          name: v.string(),
          merchantName: v.optional(v.string()),
          category: v.optional(v.string()),
          pending: v.boolean(),
        }),
      ),
    },
    handler: async (ctx, args) => {
      const now = Date.now();

      for (const txn of args.transactions) {
        const existing = await ctx.db
          .query("plaidTransactions")
          .withIndex("by_plaid_id", (q) =>
            q.eq("plaidTransactionId", txn.plaidTransactionId),
          )
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            ...txn,
            syncedAt: now,
          });
        } else {
          await ctx.db.insert("plaidTransactions", {
            userId: args.userId,
            ...txn,
            syncedAt: now,
          });
        }
      }
    },
  });

  export const deleteItem = mutation({
    args: { itemId: v.string() },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;

      // Find and verify ownership
      const item = await ctx.db
        .query("plaidItems")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .first();

      if (!item || item.userId !== userId) {
        throw new Error("Item not found or unauthorized");
      }

      // Delete associated accounts
      const accounts = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .collect();

      for (const account of accounts) {
        // Delete transactions for this account
        const transactions = await ctx.db
          .query("plaidTransactions")
          .withIndex("by_account", (q) => q.eq("accountId", account.accountId))
          .collect();

        for (const txn of transactions) {
          await ctx.db.delete(txn._id);
        }

        await ctx.db.delete(account._id);
      }

      // Delete the item
      await ctx.db.delete(item._id);

      return { success: true };
    },
  });
  ```

### 3.3 Create Banking Actions (Plaid API Calls)

- [ ] Create `frontend/convex/actions/plaid.ts`:

  ```typescript
  "use node";

  import { v } from "convex/values";
  import { action, internalAction } from "../_generated/server";
  import { internal } from "../_generated/api";
  import {
    Configuration,
    PlaidApi,
    PlaidEnvironments,
    Products,
    CountryCode,
  } from "plaid";
  import { encrypt, decrypt } from "../lib/encryption";

  // Initialize Plaid client
  const plaidConfig = new Configuration({
    basePath: PlaidEnvironments[process.env.PLAID_ENV || "sandbox"],
    baseOptions: {
      headers: {
        "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
        "PLAID-SECRET": process.env.PLAID_SECRET!,
      },
    },
  });

  const plaidClient = new PlaidApi(plaidConfig);
  const ENCRYPTION_KEY = process.env.CONVEX_ENCRYPTION_KEY!;

  // ═══════════════════════════════════════════════════════════════
  // LINK TOKEN
  // ═══════════════════════════════════════════════════════════════

  export const createLinkToken = action({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: "Fiscalis",
        products: [Products.Auth, Products.Transactions],
        country_codes: [CountryCode.Us, CountryCode.De, CountryCode.Gb],
        language: "en",
      });

      return { linkToken: response.data.link_token };
    },
  });

  export const createUpdateLinkToken = action({
    args: { itemId: v.string() },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;

      // Get the item's access token
      const items = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });

      if (!items || items.userId !== userId) {
        throw new Error("Item not found or unauthorized");
      }

      const accessToken = decrypt(items.accessToken, ENCRYPTION_KEY);

      const response = await plaidClient.linkTokenCreate({
        user: { client_user_id: userId },
        client_name: "Fiscalis",
        access_token: accessToken,
        country_codes: [CountryCode.Us, CountryCode.De, CountryCode.Gb],
        language: "en",
      });

      return { linkToken: response.data.link_token };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // TOKEN EXCHANGE
  // ═══════════════════════════════════════════════════════════════

  export const exchangeToken = action({
    args: {
      publicToken: v.string(),
      institutionId: v.optional(v.string()),
      institutionName: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;

      // Exchange public token for access token
      const exchangeResponse = await plaidClient.itemPublicTokenExchange({
        public_token: args.publicToken,
      });

      const accessToken = exchangeResponse.data.access_token;
      const itemId = exchangeResponse.data.item_id;

      // Encrypt the access token before storing
      const encryptedToken = encrypt(accessToken, ENCRYPTION_KEY);

      // Save to database
      await ctx.runMutation(internal.banking.saveItem, {
        userId,
        accessToken: encryptedToken,
        itemId,
        institutionId: args.institutionId,
        institutionName: args.institutionName,
      });

      // Fetch initial accounts
      await ctx.runAction(internal.actions.plaid.syncAccounts, { itemId });

      return { success: true, itemId };
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // SYNC OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  export const syncAccounts = internalAction({
    args: { itemId: v.string() },
    handler: async (ctx, args) => {
      // Get item with encrypted token
      const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
        itemId: args.itemId,
      });

      if (!item) throw new Error("Item not found");

      const accessToken = decrypt(item.accessToken, ENCRYPTION_KEY);

      try {
        const response = await plaidClient.accountsGet({
          access_token: accessToken,
        });

        const accounts = response.data.accounts.map((acc) => ({
          accountId: acc.account_id,
          name: acc.name,
          officialName: acc.official_name ?? undefined,
          type: acc.type,
          subtype: acc.subtype ?? undefined,
          mask: acc.mask ?? undefined,
          currentBalance: acc.balances.current ?? undefined,
          availableBalance: acc.balances.available ?? undefined,
          currency: acc.balances.iso_currency_code ?? "USD",
        }));

        await ctx.runMutation(internal.banking.saveAccounts, {
          userId: item.userId,
          itemId: args.itemId,
          accounts,
        });

        // Update item status to active
        await ctx.runMutation(internal.banking.updateItemStatus, {
          itemId: args.itemId,
          status: "active",
        });

        return { success: true, accountCount: accounts.length };
      } catch (error: any) {
        // Handle Plaid errors
        if (error.response?.data?.error_code) {
          await ctx.runMutation(internal.banking.updateItemStatus, {
            itemId: args.itemId,
            status: "error",
            errorCode: error.response.data.error_code,
          });
        }
        throw error;
      }
    },
  });

  export const syncTransactions = action({
    args: {
      itemId: v.optional(v.string()),
      startDate: v.optional(v.string()),
      endDate: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;

      // Get items to sync
      let items;
      if (args.itemId) {
        const item = await ctx.runQuery(internal.banking.getItemByIdInternal, {
          itemId: args.itemId,
        });
        if (!item || item.userId !== userId) {
          throw new Error("Item not found or unauthorized");
        }
        items = [item];
      } else {
        items = await ctx.runQuery(internal.banking.getItemsByUserInternal, {
          userId,
        });
      }

      const endDate = args.endDate || new Date().toISOString().split("T")[0];
      const startDate =
        args.startDate ||
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split("T")[0];

      let totalSynced = 0;

      for (const item of items) {
        const accessToken = decrypt(item.accessToken, ENCRYPTION_KEY);

        try {
          const response = await plaidClient.transactionsGet({
            access_token: accessToken,
            start_date: startDate,
            end_date: endDate,
            options: { count: 500 },
          });

          const transactions = response.data.transactions.map((txn) => ({
            accountId: txn.account_id,
            plaidTransactionId: txn.transaction_id,
            amount: txn.amount,
            date: txn.date,
            name: txn.name,
            merchantName: txn.merchant_name ?? undefined,
            category: txn.category?.join(", ") ?? undefined,
            pending: txn.pending,
          }));

          await ctx.runMutation(internal.banking.saveTransactions, {
            userId,
            transactions,
          });

          totalSynced += transactions.length;
        } catch (error: any) {
          console.error(
            `Error syncing transactions for item ${item.itemId}:`,
            error,
          );
          if (error.response?.data?.error_code) {
            await ctx.runMutation(internal.banking.updateItemStatus, {
              itemId: item.itemId,
              status: "error",
              errorCode: error.response.data.error_code,
            });
          }
        }
      }

      return { success: true, transactionsSynced: totalSynced };
    },
  });

  export const refreshAllAccounts = action({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;

      const items = await ctx.runQuery(
        internal.banking.getItemsByUserInternal,
        {
          userId,
        },
      );

      for (const item of items) {
        await ctx.runAction(internal.actions.plaid.syncAccounts, {
          itemId: item.itemId,
        });
      }

      return { success: true, itemsSynced: items.length };
    },
  });
  ```

### 3.4 Add Internal Queries for Actions

- [ ] Add to `frontend/convex/banking.ts`:

  ```typescript
  // ═══════════════════════════════════════════════════════════════
  // INTERNAL QUERIES (for actions)
  // ═══════════════════════════════════════════════════════════════

  export const getItemByIdInternal = internalQuery({
    args: { itemId: v.string() },
    handler: async (ctx, args) => {
      return await ctx.db
        .query("plaidItems")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .first();
    },
  });

  export const getItemsByUserInternal = internalQuery({
    args: { userId: v.string() },
    handler: async (ctx, args) => {
      return await ctx.db
        .query("plaidItems")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .collect();
    },
  });
  ```

### 3.5 Add Plaid Environment Variables to Convex

- [ ] In Convex Dashboard → Settings → Environment Variables, add:
  - `PLAID_CLIENT_ID`
  - `PLAID_SECRET`
  - `PLAID_ENV` (sandbox, development, or production)
  - `CONVEX_ENCRYPTION_KEY`

---

## Phase 4: Broker Convex Functions

### 4.1 Create Broker Functions

- [ ] Create `frontend/convex/brokers.ts`:

  ```typescript
  import { v } from "convex/values";
  import { query, mutation } from "./_generated/server";

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  export const getConnections = query({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      return await ctx.db
        .query("brokerConnections")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    },
  });

  export const getPositions = query({
    args: { connectionId: v.optional(v.id("brokerConnections")) },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;

      if (args.connectionId) {
        return await ctx.db
          .query("brokerPositions")
          .withIndex("by_connection", (q) =>
            q.eq("connectionId", args.connectionId),
          )
          .collect();
      }

      return await ctx.db
        .query("brokerPositions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    },
  });

  export const getPortfolioSummary = query({
    args: {},
    handler: async (ctx) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      const positions = await ctx.db
        .query("brokerPositions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const summary = {
        totalValue: 0,
        totalPnl: 0,
        positionCount: positions.length,
        byAssetType: {} as Record<
          string,
          { value: number; pnl: number; count: number }
        >,
      };

      for (const position of positions) {
        const value = position.marketValue ?? 0;
        const pnl = position.unrealizedPnl ?? 0;
        const assetType = position.assetType ?? "unknown";

        summary.totalValue += value;
        summary.totalPnl += pnl;

        if (!summary.byAssetType[assetType]) {
          summary.byAssetType[assetType] = { value: 0, pnl: 0, count: 0 };
        }
        summary.byAssetType[assetType].value += value;
        summary.byAssetType[assetType].pnl += pnl;
        summary.byAssetType[assetType].count += 1;
      }

      return summary;
    },
  });

  // ═══════════════════════════════════════════════════════════════
  // MUTATIONS
  // ═══════════════════════════════════════════════════════════════

  export const createConnection = mutation({
    args: {
      brokerType: v.string(),
      connectionName: v.string(),
      accountId: v.optional(v.string()),
      username: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      const now = Date.now();

      return await ctx.db.insert("brokerConnections", {
        userId,
        brokerType: args.brokerType,
        connectionName: args.connectionName,
        status: "pending",
        accountId: args.accountId,
        username: args.username,
        createdAt: now,
        updatedAt: now,
      });
    },
  });

  export const updateConnectionStatus = mutation({
    args: {
      connectionId: v.id("brokerConnections"),
      status: v.union(
        v.literal("connected"),
        v.literal("disconnected"),
        v.literal("error"),
        v.literal("pending"),
      ),
      errorMessage: v.optional(v.string()),
    },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== identity.subject) {
        throw new Error("Connection not found or unauthorized");
      }

      await ctx.db.patch(args.connectionId, {
        status: args.status,
        errorMessage: args.errorMessage,
        updatedAt: Date.now(),
      });
    },
  });

  export const deleteConnection = mutation({
    args: { connectionId: v.id("brokerConnections") },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const connection = await ctx.db.get(args.connectionId);
      if (!connection || connection.userId !== identity.subject) {
        throw new Error("Connection not found or unauthorized");
      }

      // Delete associated positions
      const positions = await ctx.db
        .query("brokerPositions")
        .withIndex("by_connection", (q) =>
          q.eq("connectionId", args.connectionId),
        )
        .collect();

      for (const position of positions) {
        await ctx.db.delete(position._id);
      }

      // Delete the connection
      await ctx.db.delete(args.connectionId);

      return { success: true };
    },
  });

  export const upsertPositions = mutation({
    args: {
      connectionId: v.id("brokerConnections"),
      positions: v.array(
        v.object({
          symbol: v.string(),
          name: v.optional(v.string()),
          quantity: v.number(),
          averageCost: v.optional(v.number()),
          currentPrice: v.optional(v.number()),
          marketValue: v.optional(v.number()),
          unrealizedPnl: v.optional(v.number()),
          currency: v.string(),
          assetType: v.optional(v.string()),
        }),
      ),
    },
    handler: async (ctx, args) => {
      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Not authenticated");

      const userId = identity.subject;
      const connection = await ctx.db.get(args.connectionId);

      if (!connection || connection.userId !== userId) {
        throw new Error("Connection not found or unauthorized");
      }

      const now = Date.now();

      for (const position of args.positions) {
        const existing = await ctx.db
          .query("brokerPositions")
          .withIndex("by_connection", (q) =>
            q.eq("connectionId", args.connectionId),
          )
          .filter((q) => q.eq(q.field("symbol"), position.symbol))
          .first();

        if (existing) {
          await ctx.db.patch(existing._id, {
            ...position,
            lastUpdated: now,
          });
        } else {
          await ctx.db.insert("brokerPositions", {
            userId,
            connectionId: args.connectionId,
            ...position,
            lastUpdated: now,
          });
        }
      }

      // Update connection sync time
      await ctx.db.patch(args.connectionId, {
        lastSyncAt: now,
        status: "connected",
        updatedAt: now,
      });

      return { success: true };
    },
  });
  ```

---

## Phase 5: Data Migration

### 5.1 Create Migration Script

- [ ] Create `frontend/scripts/migrate-to-convex.ts`:

  ```typescript
  import { ConvexHttpClient } from "convex/browser";
  import { api } from "../convex/_generated/api";
  import { db } from "../db/drizzle/drizzle";
  import {
    plaidItems,
    plaidTransactions,
    brokerConnections,
    brokerPositions,
  } from "../db/drizzle/schema";
  import { encrypt } from "../convex/lib/encryption";
  import { config } from "dotenv";

  config({ path: ".env.local" });

  const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;
  const ENCRYPTION_KEY = process.env.CONVEX_ENCRYPTION_KEY!;

  // Note: This script needs to run with admin access to Convex
  // You may need to use internal mutations or a migration endpoint

  async function migrateData() {
    console.log("Starting migration to Convex...");

    const convex = new ConvexHttpClient(CONVEX_URL);

    // 1. Migrate Plaid Items
    console.log("\n--- Migrating Plaid Items ---");
    const items = await db.select().from(plaidItems);
    console.log(`Found ${items.length} plaid items`);

    for (const item of items) {
      try {
        // Re-encrypt with new key (if needed)
        const encryptedToken = encrypt(item.accessToken, ENCRYPTION_KEY);

        // Use a migration endpoint or internal mutation
        // This is a placeholder - you'll need to create a migration endpoint
        console.log(`Migrating item: ${item.itemId} for user: ${item.userId}`);

        // Store migration data for manual import or API call
        // await convex.mutation(api.migration.importPlaidItem, { ... });
      } catch (error) {
        console.error(`Error migrating item ${item.itemId}:`, error);
      }
    }

    // 2. Migrate Plaid Transactions
    console.log("\n--- Migrating Plaid Transactions ---");
    const transactions = await db.select().from(plaidTransactions);
    console.log(`Found ${transactions.length} transactions`);

    // Batch transactions by user for efficiency
    const txnsByUser = transactions.reduce(
      (acc, txn) => {
        if (!acc[txn.userId]) acc[txn.userId] = [];
        acc[txn.userId].push(txn);
        return acc;
      },
      {} as Record<string, typeof transactions>,
    );

    for (const [userId, userTxns] of Object.entries(txnsByUser)) {
      console.log(
        `Migrating ${userTxns.length} transactions for user: ${userId}`,
      );
      // Batch import
    }

    // 3. Migrate Broker Connections
    console.log("\n--- Migrating Broker Connections ---");
    const connections = await db.select().from(brokerConnections);
    console.log(`Found ${connections.length} broker connections`);

    for (const conn of connections) {
      console.log(
        `Migrating broker connection: ${conn.connectionName} for user: ${conn.userId}`,
      );
    }

    // 4. Migrate Broker Positions
    console.log("\n--- Migrating Broker Positions ---");
    const positions = await db.select().from(brokerPositions);
    console.log(`Found ${positions.length} broker positions`);

    console.log("\n✅ Migration data collected. Review and import to Convex.");
  }

  migrateData().catch(console.error);
  ```

### 5.2 Create Migration Endpoint in Convex

- [ ] Create `frontend/convex/migration.ts`:

  ```typescript
  import { v } from "convex/values";
  import { internalMutation } from "./_generated/server";

  // These are internal mutations that should only be called during migration
  // Remove or protect these after migration is complete

  export const importPlaidItem = internalMutation({
    args: {
      userId: v.string(),
      accessToken: v.string(), // Already encrypted
      itemId: v.string(),
      institutionId: v.optional(v.string()),
      institutionName: v.optional(v.string()),
      status: v.string(),
      createdAt: v.number(),
    },
    handler: async (ctx, args) => {
      const existing = await ctx.db
        .query("plaidItems")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId))
        .first();

      if (existing) {
        console.log(`Item ${args.itemId} already exists, skipping`);
        return existing._id;
      }

      return await ctx.db.insert("plaidItems", {
        userId: args.userId,
        accessToken: args.accessToken,
        itemId: args.itemId,
        institutionId: args.institutionId,
        institutionName: args.institutionName,
        status: args.status as "active" | "error" | "pending_reauth",
        createdAt: args.createdAt,
        updatedAt: Date.now(),
      });
    },
  });

  export const importPlaidTransactions = internalMutation({
    args: {
      transactions: v.array(
        v.object({
          userId: v.string(),
          accountId: v.string(),
          plaidTransactionId: v.string(),
          amount: v.number(),
          date: v.string(),
          name: v.string(),
          merchantName: v.optional(v.string()),
          category: v.optional(v.string()),
          pending: v.boolean(),
          syncedAt: v.number(),
        }),
      ),
    },
    handler: async (ctx, args) => {
      let imported = 0;

      for (const txn of args.transactions) {
        const existing = await ctx.db
          .query("plaidTransactions")
          .withIndex("by_plaid_id", (q) =>
            q.eq("plaidTransactionId", txn.plaidTransactionId),
          )
          .first();

        if (!existing) {
          await ctx.db.insert("plaidTransactions", txn);
          imported++;
        }
      }

      return { imported };
    },
  });

  export const importBrokerConnection = internalMutation({
    args: {
      userId: v.string(),
      brokerType: v.string(),
      connectionName: v.string(),
      status: v.string(),
      accountId: v.optional(v.string()),
      username: v.optional(v.string()),
      lastSyncAt: v.optional(v.number()),
      errorMessage: v.optional(v.string()),
      createdAt: v.number(),
    },
    handler: async (ctx, args) => {
      return await ctx.db.insert("brokerConnections", {
        userId: args.userId,
        brokerType: args.brokerType,
        connectionName: args.connectionName,
        status: args.status as
          | "connected"
          | "disconnected"
          | "error"
          | "pending",
        accountId: args.accountId,
        username: args.username,
        lastSyncAt: args.lastSyncAt,
        errorMessage: args.errorMessage,
        createdAt: args.createdAt,
        updatedAt: Date.now(),
      });
    },
  });
  ```

### 5.3 Run Migration

- [ ] Run migration script:

  ```bash
  cd frontend
  bun run scripts/migrate-to-convex.ts
  ```

- [ ] Verify data in Convex Dashboard → Data

- [ ] Test that data is accessible via Convex queries

---

## Phase 6: Update Frontend Hooks

### 6.1 Update Banking Hooks

- [ ] Replace `frontend/hooks/banking.ts` with Convex-based hooks:

  ```typescript
  import { useQuery, useMutation, useAction } from "convex/react";
  import { api } from "@/convex/_generated/api";

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  export function useAccounts() {
    return useQuery(api.banking.getAccounts);
  }

  export function usePlaidItems() {
    return useQuery(api.banking.getItems);
  }

  export function useItemsNeedingReauth() {
    return useQuery(api.banking.getItemsNeedingReauth);
  }

  export function useTransactions(limit?: number, accountId?: string) {
    return useQuery(api.banking.getTransactions, { limit, accountId });
  }

  export function useBalancesSummary() {
    return useQuery(api.banking.getBalancesSummary);
  }

  // ═══════════════════════════════════════════════════════════════
  // MUTATIONS & ACTIONS
  // ═══════════════════════════════════════════════════════════════

  export function useLinkToken() {
    const createLinkToken = useAction(api.actions.plaid.createLinkToken);
    return {
      mutateAsync: createLinkToken,
      mutate: createLinkToken,
    };
  }

  export function useUpdateLinkToken() {
    const createUpdateLinkToken = useAction(
      api.actions.plaid.createUpdateLinkToken,
    );
    return {
      mutateAsync: (itemId: string) => createUpdateLinkToken({ itemId }),
      mutate: (itemId: string) => createUpdateLinkToken({ itemId }),
    };
  }

  export function useExchangeToken() {
    const exchangeToken = useAction(api.actions.plaid.exchangeToken);
    return {
      mutateAsync: ({
        publicToken,
        institutionId,
        institutionName,
      }: {
        publicToken: string;
        institutionId?: string;
        institutionName?: string;
      }) => exchangeToken({ publicToken, institutionId, institutionName }),
    };
  }

  export function useDeleteItem() {
    const deleteItem = useMutation(api.banking.deleteItem);
    return {
      mutateAsync: (itemId: string) => deleteItem({ itemId }),
      mutate: (itemId: string) => deleteItem({ itemId }),
    };
  }

  export function useSyncTransactions() {
    const syncTransactions = useAction(api.actions.plaid.syncTransactions);
    return {
      mutateAsync: (args?: {
        itemId?: string;
        startDate?: string;
        endDate?: string;
      }) => syncTransactions(args ?? {}),
    };
  }

  export function useRefreshAccounts() {
    const refreshAccounts = useAction(api.actions.plaid.refreshAllAccounts);
    return {
      mutateAsync: refreshAccounts,
    };
  }
  ```

### 6.2 Update Broker Hooks

- [ ] Replace `frontend/hooks/brokers.ts` with Convex-based hooks:

  ```typescript
  import { useQuery, useMutation } from "convex/react";
  import { api } from "@/convex/_generated/api";
  import { Id } from "@/convex/_generated/dataModel";

  // ═══════════════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════════════

  export function useBrokerConnections() {
    return useQuery(api.brokers.getConnections);
  }

  export function useBrokerPositions(connectionId?: Id<"brokerConnections">) {
    return useQuery(api.brokers.getPositions, { connectionId });
  }

  export function usePortfolioSummary() {
    return useQuery(api.brokers.getPortfolioSummary);
  }

  // ═══════════════════════════════════════════════════════════════
  // MUTATIONS
  // ═══════════════════════════════════════════════════════════════

  export function useCreateBrokerConnection() {
    const createConnection = useMutation(api.brokers.createConnection);
    return {
      mutateAsync: (data: {
        brokerType: string;
        connectionName: string;
        accountId?: string;
        username?: string;
      }) => createConnection(data),
    };
  }

  export function useDeleteBrokerConnection() {
    const deleteConnection = useMutation(api.brokers.deleteConnection);
    return {
      mutateAsync: (connectionId: Id<"brokerConnections">) =>
        deleteConnection({ connectionId }),
    };
  }

  export function useUpdateBrokerConnectionStatus() {
    const updateStatus = useMutation(api.brokers.updateConnectionStatus);
    return {
      mutateAsync: (data: {
        connectionId: Id<"brokerConnections">;
        status: "connected" | "disconnected" | "error" | "pending";
        errorMessage?: string;
      }) => updateStatus(data),
    };
  }

  export function useUpsertBrokerPositions() {
    const upsertPositions = useMutation(api.brokers.upsertPositions);
    return {
      mutateAsync: (data: {
        connectionId: Id<"brokerConnections">;
        positions: Array<{
          symbol: string;
          name?: string;
          quantity: number;
          averageCost?: number;
          currentPrice?: number;
          marketValue?: number;
          unrealizedPnl?: number;
          currency: string;
          assetType?: string;
        }>;
      }) => upsertPositions(data),
    };
  }
  ```

---

## Phase 7: Cleanup

### 7.1 Remove Old API Routes

- [ ] Delete or comment out banking routes from `frontend/app/(api)/api/[[...route]]/banking.ts`

- [ ] Delete or comment out broker routes from `frontend/app/(api)/api/[[...route]]/brokers.ts`

- [ ] Update `frontend/app/(api)/api/[[...route]]/route.ts` to only include metals:

  ```typescript
  import { Hono } from "hono";
  import { handle } from "hono/vercel";
  import metals from "./metals";

  export const runtime = "edge";

  const app = new Hono().basePath("/api");

  const routes = app.route("/metals", metals);

  export const GET = handle(app);
  export const POST = handle(app);

  export type AppType = typeof routes;
  ```

### 7.2 Remove Old API Wrapper Functions

- [ ] Delete `frontend/lib/api/banking.ts`
- [ ] Delete `frontend/lib/api/brokers.ts`

### 7.3 Update Drizzle Schema

- [ ] Remove migrated tables from `frontend/db/drizzle/schema.ts`:
  - Keep: `precious_metal_prices`, `currency_exchange_rates`
  - Remove: `plaidItems`, `plaidTransactions`, `brokerConnections`, `brokerPositions`, enums

### 7.4 Update Types

- [ ] Update `frontend/lib/types/banking.ts` to use Convex types:

  ```typescript
  import { Doc } from "@/convex/_generated/dataModel";

  export type PlaidItem = Doc<"plaidItems">;
  export type PlaidAccount = Doc<"plaidAccounts">;
  export type PlaidTransaction = Doc<"plaidTransactions">;
  ```

- [ ] Update `frontend/lib/types/brokers.ts` to use Convex types:

  ```typescript
  import { Doc, Id } from "@/convex/_generated/dataModel";

  export type BrokerConnection = Doc<"brokerConnections">;
  export type BrokerPosition = Doc<"brokerPositions">;
  export type BrokerConnectionId = Id<"brokerConnections">;
  ```

### 7.5 Remove Migration Files (After Verification)

- [ ] Delete `frontend/convex/migration.ts` (after successful migration)
- [ ] Delete `frontend/scripts/migrate-to-convex.ts`

---

## Phase 8: Testing & Verification

### 8.1 Functional Testing

- [ ] Test Plaid Link flow (connect new bank)
- [ ] Test account display and balance summary
- [ ] Test transaction listing and filtering
- [ ] Test bank disconnection
- [ ] Test re-authentication flow
- [ ] Test broker connection CRUD
- [ ] Test broker positions display

### 8.2 Real-time Testing

- [ ] Verify real-time updates when data changes
- [ ] Test optimistic updates
- [ ] Test multiple browser tabs/windows

### 8.3 Error Handling

- [ ] Test Plaid API error handling
- [ ] Test authentication errors
- [ ] Test network failures

### 8.4 Performance Testing

- [ ] Compare page load times (before vs after)
- [ ] Monitor Convex Dashboard for query performance

---

## Phase 9: Documentation Update

### 9.1 Update Architecture Document

- [ ] Update `docs/ARCHITECTURE.md` with:
  - New hybrid architecture diagram
  - Updated data flow diagrams
  - Convex-specific sections

### 9.2 Update Tech Stack

- [ ] Add Convex to `docs/ARCHITECTURE.md` tech stack section

### 9.3 Update README

- [ ] Add Convex setup instructions to project README
- [ ] Document new environment variables

---

## Checklist Summary

### Phase 1: Setup & Infrastructure

- [ ] Install Convex
- [ ] Configure Clerk JWT template
- [ ] Add environment variables
- [ ] Create auth config
- [ ] Create Convex provider
- [ ] Update root layout
- [ ] Deploy initial configuration

### Phase 2: Schema & Encryption

- [ ] Create encryption utility
- [ ] Create Convex schema
- [ ] Deploy schema

### Phase 3: Banking Functions

- [ ] Create banking queries
- [ ] Create banking mutations
- [ ] Create Plaid actions
- [ ] Add internal queries
- [ ] Configure Plaid env vars in Convex

### Phase 4: Broker Functions

- [ ] Create broker queries
- [ ] Create broker mutations

### Phase 5: Data Migration

- [ ] Create migration script
- [ ] Create migration endpoints
- [ ] Run migration
- [ ] Verify data

### Phase 6: Frontend Update

- [ ] Update banking hooks
- [ ] Update broker hooks

### Phase 7: Cleanup

- [ ] Remove old API routes
- [ ] Remove old API wrappers
- [ ] Update Drizzle schema
- [ ] Update types
- [ ] Remove migration files

### Phase 8: Testing

- [ ] Functional testing
- [ ] Real-time testing
- [ ] Error handling testing
- [ ] Performance testing

### Phase 9: Documentation

- [ ] Update architecture docs
- [ ] Update tech stack
- [ ] Update README

---

## Estimated Timeline

| Phase              | Duration  | Dependencies |
| ------------------ | --------- | ------------ |
| Phase 1: Setup     | 2-3 hours | None         |
| Phase 2: Schema    | 1-2 hours | Phase 1      |
| Phase 3: Banking   | 4-6 hours | Phase 2      |
| Phase 4: Brokers   | 2-3 hours | Phase 2      |
| Phase 5: Migration | 2-4 hours | Phases 3, 4  |
| Phase 6: Frontend  | 2-3 hours | Phase 5      |
| Phase 7: Cleanup   | 1-2 hours | Phase 6      |
| Phase 8: Testing   | 2-4 hours | Phase 7      |
| Phase 9: Docs      | 1-2 hours | Phase 8      |

**Total: ~2-3 days**

---

## Rollback Plan

If issues are encountered:

1. **Keep Neon database intact** - Don't delete data until Convex is fully verified
2. **Feature flag** - Consider adding a feature flag to switch between Convex and Hono APIs
3. **Git branches** - Work on a feature branch, only merge after thorough testing
4. **Backup** - Export Convex data before any major changes

---

## Future Enhancements (Deferred)

- [ ] Vault feature (physical commodities tracking)
- [ ] Loans feature (loan management + calculator integration)
- [ ] SnapTrade integration (broker API)
- [ ] User settings/preferences
- [ ] Real-time notifications
