# SnapTrade Integration Implementation Plan

## Overview

This document outlines the step-by-step implementation plan for integrating SnapTrade into Fiscalis to enable broker connections. SnapTrade will be the primary provider for traditional brokerage accounts (stocks, ETFs, options, retirement accounts).

### Current Status

- ✅ SnapTrade credentials configured in `.env.local`
- ✅ SnapTrade SDK installed (`snaptrade-typescript-sdk` for backend)
- ✅ SnapTrade React SDK installed (`snaptrade-react` for frontend)
- ✅ Convex environment variables set
- ✅ Phase 1 complete (Environment Setup)
- ✅ Phase 2 complete (Database Schema)
- ✅ Phase 3 complete (Convex Actions)
- ✅ Phase 4 complete (Queries & Mutations)
- ✅ Phase 5 complete (Frontend Hooks)
- ✅ Phase 6 complete (Frontend Components)
- ✅ Phase 7 complete (Testing & Validation)
- ✅ Phase 9 complete (Error Handling Improvements)
- ⏳ Phase 8 optional (Positions Page)
- ⏳ Phase 10 optional (Webhooks)

---

## Connection Portal Integration Strategy

Based on [SnapTrade's documentation](https://docs.snaptrade.com/docs/implement-connection-portal), we will use the **React SDK approach** (`snaptrade-react`) for the best user experience:

### Why React SDK?

- Renders connection portal in an **iframe** (user stays in our app)
- Built-in callbacks: `onSuccess`, `onError`, `onExit`
- Returns `authorizationId` directly on success
- No redirect/callback page needed

### Connection Flow

```
1. User clicks "Connect Broker"
2. Backend generates login URL (createConnectUrl action)
3. Frontend opens SnapTrade modal using snaptrade-react
4. User authenticates with their broker
5. SDK fires onSuccess with authorizationId
6. Frontend calls handleCallback action with authorizationId
7. Backend syncs accounts and positions
8. UI updates in real-time via Convex
```

### Window Messages to Handle

| Message       | Description                                                            |
| ------------- | ---------------------------------------------------------------------- |
| `SUCCESS`     | `{status: 'SUCCESS', authorizationId: 'xxx'}` - Connection successful  |
| `ERROR`       | `{status: 'ERROR', errorCode, statusCode, detail}` - Connection failed |
| `CLOSE_MODAL` | User clicked "Done" or exited                                          |
| `CLOSED`      | User closed OAuth window                                               |

---

## Phase 1: Environment Setup & Research ✅ COMPLETE

### Task 1.1: Complete SnapTrade Account Setup ✅

- [x] Log into SnapTrade dashboard
- [x] Obtain Consumer Key (Client ID) - `SNAPTRADE_CLIENT_ID`
- [x] Obtain API Secret - `SNAPTRADE_SECRET`
- [ ] Set up webhook URL in SnapTrade dashboard (optional, Phase 11)

### Task 1.2: Install SnapTrade SDK ✅

```bash
cd frontend
bun add snaptrade-typescript-sdk  # Backend SDK (Convex actions)
bun add snaptrade-react           # Frontend SDK (React component) - Phase 6
```

### Task 1.3: Add Environment Variables ✅

`.env.local`:

```env
SNAPTRADE_CLIENT_ID=MEDIENARGENTUR-JOSHUA-FEHN-TEST-IXMSB
SNAPTRADE_SECRET=xvmIEo2I799ype5JODQJE2uKNqPY4CWslnp0v2zUU5ldw0g7iq
```

Convex environment variables: ✅ Set via dashboard

---

## Phase 2: Database Schema ✅ COMPLETE

### Task 2.1: Update Convex Schema

File: `convex/schema.ts`

Add/update the following tables:

```typescript
// SnapTrade user registration (one per Fiscalis user)
snaptradeUsers: defineTable({
  clerkUserId: v.string(),
  snaptradeUserId: v.string(),
  snaptradeUserSecret: v.string(), // Encrypted
  createdAt: v.number(),
})
  .index("by_clerk_user", ["clerkUserId"])
  .index("by_snaptrade_user", ["snaptradeUserId"]),

// Broker connections (one per connected broker)
brokerConnections: defineTable({
  clerkUserId: v.string(),
  snaptradeUserId: v.string(),
  authorizationId: v.string(), // SnapTrade's connection ID
  brokerName: v.string(),
  brokerSlug: v.string(),
  brokerLogo: v.optional(v.string()),
  status: v.union(
    v.literal("connected"),
    v.literal("error"),
    v.literal("reauth_required"),
    v.literal("syncing")
  ),
  errorMessage: v.optional(v.string()),
  lastSyncAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})
  .index("by_clerk_user", ["clerkUserId"])
  .index("by_authorization", ["authorizationId"]),

// Brokerage accounts (multiple per connection)
brokerAccounts: defineTable({
  connectionId: v.id("brokerConnections"),
  clerkUserId: v.string(),
  snaptradeAccountId: v.string(),
  name: v.string(),
  accountNumber: v.optional(v.string()),
  accountType: v.string(), // "TFSA", "RRSP", "MARGIN", "CASH", etc.
  balance: v.optional(v.number()),
  currency: v.string(),
  lastSyncAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_connection", ["connectionId"])
  .index("by_clerk_user", ["clerkUserId"]),

// Positions/Holdings
brokerPositions: defineTable({
  accountId: v.id("brokerAccounts"),
  clerkUserId: v.string(),
  symbol: v.string(),
  name: v.optional(v.string()),
  assetType: v.string(), // "stock", "etf", "option", "bond", etc.
  quantity: v.number(),
  averageCostBasis: v.optional(v.number()),
  currentPrice: v.optional(v.number()),
  marketValue: v.optional(v.number()),
  currency: v.string(),
  // Identifiers
  isin: v.optional(v.string()),
  cusip: v.optional(v.string()),
  figi: v.optional(v.string()),
  // P&L
  unrealizedPL: v.optional(v.number()),
  unrealizedPLPercent: v.optional(v.number()),
  lastSyncAt: v.optional(v.number()),
  createdAt: v.number(),
})
  .index("by_account", ["accountId"])
  .index("by_clerk_user", ["clerkUserId"])
  .index("by_symbol", ["symbol"]),

// Transactions/Activities (optional for Phase 1)
brokerTransactions: defineTable({
  accountId: v.id("brokerAccounts"),
  clerkUserId: v.string(),
  snaptradeTransactionId: v.string(),
  type: v.string(), // "BUY", "SELL", "DIVIDEND", "TRANSFER", etc.
  symbol: v.optional(v.string()),
  quantity: v.optional(v.number()),
  price: v.optional(v.number()),
  amount: v.number(),
  currency: v.string(),
  fees: v.optional(v.number()),
  date: v.number(),
  description: v.optional(v.string()),
  createdAt: v.number(),
})
  .index("by_account", ["accountId"])
  .index("by_clerk_user", ["clerkUserId"])
  .index("by_date", ["date"]),
```

### Task 2.2: Run Schema Migration

```bash
cd frontend
bunx convex dev --once
```

---

## Phase 3: Convex Actions (SnapTrade API Integration)

### Task 3.1: Create SnapTrade Client Utility

File: `convex/lib/snaptrade.ts`

```typescript
import { Snaptrade } from "snaptrade-typescript-sdk";

export function getSnaptradeClient() {
  const clientId = process.env.SNAPTRADE_CLIENT_ID;
  const consumerKey = process.env.SNAPTRADE_API_KEY;

  if (!clientId || !consumerKey) {
    throw new Error("SnapTrade credentials not configured");
  }

  return new Snaptrade({
    clientId,
    consumerKey,
  });
}
```

### Task 3.2: Create SnapTrade Actions

File: `convex/actions/snaptrade.ts`

Implement the following actions:

#### 3.2.1: Register User

```typescript
export const registerUser = action({
  args: {},
  handler: async (ctx) => {
    // 1. Get authenticated user
    // 2. Check if already registered with SnapTrade
    // 3. Call snaptrade.authentication.registerSnapTradeUser()
    // 4. Encrypt and store userSecret
    // 5. Return success
  },
});
```

#### 3.2.2: Delete User

```typescript
export const deleteUser = action({
  args: {},
  handler: async (ctx) => {
    // 1. Get SnapTrade user credentials
    // 2. Call snaptrade.authentication.deleteSnapTradeUser()
    // 3. Remove from database
  },
});
```

#### 3.2.3: Generate Connect URL

```typescript
export const createConnectUrl = action({
  args: {
    broker: v.optional(v.string()), // Optional: pre-select broker
  },
  handler: async (ctx, args) => {
    // 1. Get SnapTrade user credentials
    // 2. Call snaptrade.authentication.loginSnapTradeUser()
    // 3. Return redirect URL for SnapTrade Connect
  },
});
```

#### 3.2.4: Handle OAuth Callback

```typescript
export const handleCallback = action({
  args: {
    authorizationId: v.string(),
  },
  handler: async (ctx, args) => {
    // 1. Verify the connection exists
    // 2. Get brokerage info
    // 3. Store connection in database
    // 4. Trigger initial sync
  },
});
```

#### 3.2.5: Sync Accounts

```typescript
export const syncAccounts = action({
  args: {
    connectionId: v.id("brokerConnections"),
  },
  handler: async (ctx, args) => {
    // 1. Get connection details
    // 2. Call snaptrade.accountInformation.listUserAccounts()
    // 3. Upsert accounts to database
  },
});
```

#### 3.2.6: Sync Positions

```typescript
export const syncPositions = action({
  args: {
    accountId: v.id("brokerAccounts"),
  },
  handler: async (ctx, args) => {
    // 1. Get account details
    // 2. Call snaptrade.accountInformation.getUserHoldings()
    // 3. Normalize position data
    // 4. Upsert positions to database
  },
});
```

#### 3.2.7: Sync All (Convenience)

```typescript
export const syncAll = action({
  args: {},
  handler: async (ctx) => {
    // 1. Get all user connections
    // 2. For each connection: sync accounts
    // 3. For each account: sync positions
    // 4. Return summary
  },
});
```

#### 3.2.8: Delete Connection

```typescript
export const deleteConnection = action({
  args: {
    connectionId: v.id("brokerConnections"),
  },
  handler: async (ctx, args) => {
    // 1. Get connection
    // 2. Call snaptrade.connections.removeBrokerageAuthorization()
    // 3. Delete from database (cascade to accounts/positions)
  },
});
```

#### 3.2.9: List Available Brokers

```typescript
export const listBrokers = action({
  args: {},
  handler: async (ctx) => {
    // 1. Call snaptrade.referenceData.listAllBrokerages()
    // 2. Return list of available brokers with logos
  },
});
```

---

## Phase 4: Convex Queries & Mutations

### Task 4.1: Update Brokers Module

File: `convex/brokers.ts`

#### Queries

```typescript
// Get SnapTrade user status
export const getSnaptradeUser = query({...});

// Get all broker connections
export const getConnections = query({...});

// Get accounts for a connection (or all)
export const getAccounts = query({...});

// Get positions for an account (or all)
export const getPositions = query({...});

// Get transactions for an account
export const getTransactions = query({...});

// Get portfolio summary (aggregated)
export const getPortfolioSummary = query({...});
```

#### Mutations (Internal, called by actions)

```typescript
// Create/update SnapTrade user
export const upsertSnaptradeUser = internalMutation({...});

// Create/update connection
export const upsertConnection = internalMutation({...});

// Create/update account
export const upsertAccount = internalMutation({...});

// Create/update position
export const upsertPosition = internalMutation({...});

// Update connection status
export const updateConnectionStatus = internalMutation({...});

// Delete connection (cascades)
export const deleteConnectionData = internalMutation({...});
```

---

## Phase 5: Frontend Hooks

### Task 5.1: Create Broker Hooks

File: `hooks/convex/brokers.ts`

```typescript
// Check if user is registered with SnapTrade
export function useSnaptradeUser() {
  return useQuery(api.brokers.getSnaptradeUser);
}

// Register user with SnapTrade
export function useRegisterSnaptrade() {
  const register = useAction(api.actions.snaptrade.registerUser);
  // Return with loading state wrapper
}

// Get connect URL for SnapTrade
export function useCreateConnectUrl() {
  const createUrl = useAction(api.actions.snaptrade.createConnectUrl);
  // Return with loading state wrapper
}

// Get all broker connections (real-time)
export function useBrokerConnections() {
  return useQuery(api.brokers.getConnections);
}

// Get all broker accounts (real-time)
export function useBrokerAccounts(connectionId?: Id<"brokerConnections">) {
  return useQuery(api.brokers.getAccounts, { connectionId });
}

// Get all positions (real-time)
export function useBrokerPositions(accountId?: Id<"brokerAccounts">) {
  return useQuery(api.brokers.getPositions, { accountId });
}

// Get portfolio summary
export function usePortfolioSummary() {
  return useQuery(api.brokers.getPortfolioSummary);
}

// Sync all broker data
export function useSyncBrokers() {
  const sync = useAction(api.actions.snaptrade.syncAll);
  // Return with loading state wrapper
}

// Delete a connection
export function useDeleteConnection() {
  const deleteConn = useAction(api.actions.snaptrade.deleteConnection);
  // Return with loading state wrapper
}
```

### Task 5.2: Export Hooks

File: `hooks/convex/index.ts`

```typescript
export * from "./banking";
export * from "./brokers";
```

---

## Phase 6: Frontend Components ✅ COMPLETE

### Task 6.1: Atoms

#### SnapTrade Connect Button ✅

File: `components/atomic/atoms/snaptradeConnectButton.tsx`

- Uses `useWindowMessage` hook from `snaptrade-react` for iframe message handling
- Embeds SnapTrade portal in Dialog modal
- Handles SUCCESS/ERROR/EXIT messages
- Shows processing and success states
- Props: `broker?`, `buttonText?`, `variant?`, `size?`, `onSuccess?`, `onError?`

#### Broker Account Card ✅

File: `components/atomic/atoms/brokerAccountCard.tsx`

- Shows account name, type badge (with icons for retirement/margin/etc.)
- Total value, cash balance, invested amount
- Account number masking for privacy

#### Broker Connection Card ✅

File: `components/atomic/atoms/brokerConnectionCard.tsx`

- Displays broker logo and name
- Connection status badge
- Last sync time

### Task 6.2: Molecules

#### Broker Accounts Card ✅

File: `components/atomic/molecules/brokerAccountsCard.tsx`

- Shows broker connection with all accounts in a grid
- Dropdown menu with Refresh and Disconnect actions
- Confirmation dialog for disconnection
- Total portfolio value display

#### Broker Re-auth Card ✅

File: `components/atomic/molecules/brokerReauthCard.tsx`

- Yellow warning styling for connections needing attention
- Reconnect button that opens SnapTrade portal in modal
- Same iframe/message handling as connect button

### Task 6.3: Organisms

#### Brokers Card ✅

File: `components/atomic/organisms/brokersCard.tsx`

- Loading skeleton state
- Empty state with connect button CTA
- "Needs sync" state with sync button
- Displays reauth cards first, then connected brokers
- Header with "Refresh All" and "Add Broker" buttons

---

## Phase 7: Testing & Validation ✅ COMPLETE

### Task 7.1: TypeScript Compilation Check ✅

```bash
cd frontend
bunx tsc --noEmit
```

- [x] No TypeScript errors
- [x] All imports resolve correctly

### Task 7.2: Runtime Testing Checklist ✅

#### User Registration Flow

- [x] Visit `/brokers` page shows empty state
- [x] Click "Connect Your Broker" button
- [x] User auto-registers with SnapTrade (if not already)
- [x] SnapTrade modal opens with broker list

#### Broker Connection Flow

- [x] Select "SnapTrade Demo" broker (Alpaca Paper tested)
- [x] Complete authentication in iframe
- [x] SUCCESS message received and processed
- [x] Connection appears in database
- [x] UI updates in real-time

#### Data Sync Flow

- [x] Accounts sync after connection
- [x] "Refresh All" button triggers sync
- [x] Last sync time updates
- [x] Loading states show during sync
- [x] Balance persists correctly after refresh

#### Disconnection Flow

- [x] Click dropdown menu on connection
- [x] "Disconnect broker" shows confirmation dialog
- [x] Confirm deletes connection from SnapTrade
- [x] Connection and accounts removed from database
- [x] UI updates to show empty state (if last connection)

#### Error Handling

- [x] SnapTrade error shows detail message
- [x] Re-auth required state triggers BrokerReauthCard

### Task 7.3: Test with SnapTrade Demo Broker ✅

Tested with Alpaca Paper broker:

- Successfully connected
- Balance displays correctly ($100,000)
- Refresh preserves balance
- Disconnect works properly

---

## Phase 8: Connection Flow Messages (Reference)

> **Note**: With the `snaptrade-react` SDK approach, we NO LONGER need a callback page.
> The SDK handles the OAuth flow in an iframe and fires callbacks directly.

### Task 7.1: Window Message Handling

The `snaptrade-react` SDK handles this internally, but for custom implementations:

```typescript
// Window messages from SnapTrade Connection Portal:
useEffect(() => {
  const handleMessage = (e: MessageEvent) => {
    if (e.data?.status === "SUCCESS") {
      const { authorizationId } = e.data;
      // Call handleCallback action
    }
    if (e.data?.status === "ERROR") {
      const { errorCode, statusCode, detail } = e.data;
      // Show error to user
    }
    if (e.data === "CLOSE_MODAL" || e.data === "CLOSED") {
      // Close the modal
    }
  };
  window.addEventListener("message", handleMessage);
  return () => window.removeEventListener("message", handleMessage);
}, []);
```

### Task 7.2: ~~Create Callback Page~~ (NOT NEEDED)

~~File: `app/(root)/brokers/callback/page.tsx`~~

With the iframe approach, the callback is handled via window messages.
No redirect or callback page is required.

---

## Phase 8: Brokers Page

### Task 8.1: Update Brokers Page

File: `app/(root)/brokers/page.tsx`

```typescript
// Layout:
// 1. Header section
// 2. Portfolio summary cards
// 3. Connected brokers list
// 4. Positions table (or link to dedicated page)
```

### Task 8.2: Create Positions Page (Optional)

File: `app/(root)/brokers/positions/page.tsx`

```typescript
// Detailed positions view:
// - Full data table
// - Charts
// - Filters
```

---

## Phase 9: Error Handling & Edge Cases

### Task 9.1: Connection Error States

Handle the following scenarios:

- [ ] SnapTrade user not registered → Auto-register
- [ ] Connection expired → Show re-auth button
- [ ] Broker API error → Show error message with retry
- [ ] Rate limited → Queue and retry with backoff
- [ ] Partial sync failure → Mark specific items as failed

### Task 9.2: Re-authentication Flow

```typescript
export const refreshConnection = action({
  args: { connectionId: v.id("brokerConnections") },
  handler: async (ctx, args) => {
    // 1. Get connection
    // 2. Generate new connect URL with authorization ID
    // 3. Return URL for user to re-authenticate
  },
});
```

### Task 9.3: Loading States

Add loading skeletons for:

- [ ] Connection cards
- [ ] Account cards
- [ ] Positions table
- [ ] Portfolio summary

---

## Phase 10: Testing

### Task 10.1: Manual Testing Checklist

- [ ] Register new user with SnapTrade
- [ ] Connect to sandbox broker
- [ ] View connected accounts
- [ ] View positions
- [ ] Disconnect broker
- [ ] Re-connect after disconnect
- [ ] Handle expired connection
- [ ] Verify data refresh works

### Task 10.2: Test with Real Brokers (Sandbox)

SnapTrade sandbox brokers to test:

- [ ] "SnapTrade Demo" - Always available
- [ ] Interactive Brokers (paper trading)
- [ ] Alpaca (paper trading)

---

## Phase 11: Webhooks (Optional Enhancement)

### Task 11.1: Create Webhook Endpoint

File: `app/(api)/api/webhooks/snaptrade/route.ts`

```typescript
// Handle SnapTrade webhook events:
// - ACCOUNT_UPDATED
// - HOLDINGS_UPDATED
// - CONNECTION_BROKEN
// - CONNECTION_DELETED
```

### Task 11.2: Configure Webhook in SnapTrade Dashboard

- [ ] Set webhook URL
- [ ] Select events to receive
- [ ] Verify webhook signature

---

## Phase 10: Webhook Implementation (Detailed Guide)

### Overview

SnapTrade webhooks allow your app to receive real-time notifications when:

- Account data changes (balances, holdings)
- Connections become broken or require re-authentication
- Connections are deleted
- Transactions occur

### Why Implement Webhooks?

**Without webhooks**: You must manually sync data by calling `syncAll()` or `syncPositions()`.

**With webhooks**: SnapTrade pushes updates to your app automatically, keeping data fresh in real-time.

### Webhook Events

| Event                | Description                  | When to Use                          |
| -------------------- | ---------------------------- | ------------------------------------ |
| `ACCOUNT_UPDATED`    | Account balance/info changed | Update account balance/status        |
| `HOLDINGS_UPDATED`   | Positions changed            | Refresh positions for account        |
| `CONNECTION_BROKEN`  | Auth expired/revoked         | Mark connection as `reauth_required` |
| `CONNECTION_DELETED` | User disconnected broker     | Clean up connection data             |
| `TRANSACTIONS`       | New transactions             | Update transaction history           |

### Implementation Steps

#### Step 1: Create the Webhook Route

File: `app/(api)/api/webhooks/snaptrade/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@/convex/_generated/api";

const convex = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

// Verify SnapTrade webhook signature
function verifySignature(
  payload: string,
  signature: string | null,
  secret: string,
): boolean {
  if (!signature) return false;

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}

export async function POST(request: NextRequest) {
  const webhookSecret = process.env.SNAPTRADE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error("SNAPTRADE_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Configuration error" }, { status: 500 });
  }

  // Get raw body for signature verification
  const payload = await request.text();
  const signature = request.headers.get("x-snaptrade-signature");

  // Verify signature
  if (!verifySignature(payload, signature, webhookSecret)) {
    console.error("Invalid webhook signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // Parse the webhook payload
  const event = JSON.parse(payload);

  console.log("SnapTrade webhook received:", event.type);

  try {
    switch (event.type) {
      case "ACCOUNT_UPDATED":
        await handleAccountUpdated(event.data);
        break;

      case "HOLDINGS_UPDATED":
        await handleHoldingsUpdated(event.data);
        break;

      case "CONNECTION_BROKEN":
        await handleConnectionBroken(event.data);
        break;

      case "CONNECTION_DELETED":
        await handleConnectionDeleted(event.data);
        break;

      case "TRANSACTIONS":
        await handleTransactions(event.data);
        break;

      default:
        console.log("Unhandled webhook event type:", event.type);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Webhook processing error:", error);
    return NextResponse.json({ error: "Processing failed" }, { status: 500 });
  }
}

async function handleAccountUpdated(data: any) {
  // Trigger a sync for the specific account
  // You'll need to map the SnapTrade accountId to your internal accountId
  console.log("Account updated:", data.account_id);

  // Option 1: Call a Convex action to sync the account
  // await convex.action(api.actions.snaptrade.syncAccountById, {
  //   snaptradeAccountId: data.account_id,
  // });

  // Option 2: Directly update via internal mutation (need to expose it)
}

async function handleHoldingsUpdated(data: any) {
  // Trigger a position sync for the account
  console.log("Holdings updated for account:", data.account_id);
}

async function handleConnectionBroken(data: any) {
  // Mark the connection as requiring re-authentication
  console.log("Connection broken:", data.authorization_id);

  // Update connection status to reauth_required
  // await convex.mutation(api.brokers.updateConnectionStatusByAuthId, {
  //   authorizationId: data.authorization_id,
  //   status: "reauth_required",
  //   errorMessage: "Connection requires re-authentication",
  // });
}

async function handleConnectionDeleted(data: any) {
  // Clean up the connection from our database
  console.log("Connection deleted:", data.authorization_id);

  // Delete connection data
  // await convex.mutation(api.brokers.deleteConnectionByAuthId, {
  //   authorizationId: data.authorization_id,
  // });
}

async function handleTransactions(data: any) {
  // Process new transactions
  console.log("New transactions for account:", data.account_id);
}
```

#### Step 2: Add Webhook Mutations to Convex

Add to `convex/brokers.ts`:

```typescript
// Internal mutation to update connection by authorization ID (for webhooks)
export const updateConnectionStatusByAuthId = internalMutation({
  args: {
    authorizationId: v.string(),
    status: v.union(
      v.literal("connected"),
      v.literal("syncing"),
      v.literal("error"),
      v.literal("reauth_required"),
      v.literal("disconnected"),
    ),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("brokerConnections")
      .withIndex("by_authorization_id", (q) =>
        q.eq("authorizationId", args.authorizationId),
      )
      .first();

    if (!connection) {
      console.error(
        "Connection not found for authorizationId:",
        args.authorizationId,
      );
      return;
    }

    await ctx.db.patch(connection._id, {
      status: args.status,
      errorMessage: args.errorMessage,
      lastSyncAt: Date.now(),
    });
  },
});

// Internal mutation to delete connection by authorization ID (for webhooks)
export const deleteConnectionByAuthId = internalMutation({
  args: {
    authorizationId: v.string(),
  },
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("brokerConnections")
      .withIndex("by_authorization_id", (q) =>
        q.eq("authorizationId", args.authorizationId),
      )
      .first();

    if (!connection) {
      return;
    }

    // Delete all related data (same as deleteConnectionData)
    // ... cascading deletes for accounts, positions, transactions
  },
});
```

#### Step 3: Configure Webhooks in SnapTrade Dashboard

1. Log into your SnapTrade dashboard
2. Navigate to **Webhooks** settings
3. Add webhook URL: `https://your-app.com/api/webhooks/snaptrade`
4. Select events to receive:
   - `ACCOUNT_UPDATED`
   - `HOLDINGS_UPDATED`
   - `CONNECTION_BROKEN`
   - `CONNECTION_DELETED`
5. Copy the **Webhook Secret** and add to `.env.local`:
   ```
   SNAPTRADE_WEBHOOK_SECRET=your_webhook_secret_here
   ```

#### Step 4: Add Database Index

Ensure the `by_authorization_id` index exists in your schema:

```typescript
// convex/schema.ts
brokerConnections: defineTable({
  // ... existing fields
})
  .index("by_user", ["userId"])
  .index("by_authorization_id", ["authorizationId"]),
```

### Testing Webhooks Locally

For local development, use a tunneling service like ngrok:

```bash
# Start ngrok tunnel
ngrok http 3000

# Use the ngrok URL in SnapTrade dashboard
# https://abc123.ngrok.io/api/webhooks/snaptrade
```

### Production Considerations

1. **Idempotency**: Handle duplicate webhook deliveries gracefully
2. **Rate limiting**: SnapTrade may batch events; handle multiple events per request
3. **Retry logic**: Return 200 quickly; process asynchronously if needed
4. **Logging**: Log all webhook events for debugging
5. **Security**: Always verify signatures; never trust unsigned webhooks

---

## File Checklist

### New Files to Create

```
convex/
├── lib/
│   └── snaptrade.ts                    # SnapTrade client utility
├── actions/
│   └── snaptrade.ts                    # SnapTrade API actions
└── brokers.ts                          # Queries & mutations (update existing)

hooks/convex/
└── brokers.ts                          # Broker hooks (update existing)

components/atomic/
├── atoms/
│   ├── snaptradeConnectButton.tsx
│   ├── brokerConnectionCard.tsx
│   ├── brokerAccountCard.tsx
│   └── positionRow.tsx
├── molecules/
│   ├── brokerConnectionsCard.tsx
│   ├── positionsTable.tsx
│   └── accountSummaryCard.tsx
└── organisms/
    └── brokersCard.tsx

app/(root)/brokers/
├── page.tsx                            # Main brokers page (update)
├── callback/
│   └── page.tsx                        # OAuth callback handler
└── positions/
    └── page.tsx                        # Detailed positions view (optional)

app/(api)/api/webhooks/snaptrade/
└── route.ts                            # Webhook handler (optional)
```

### Files to Update

```
.env.local                              # Add SNAPTRADE_CLIENT_ID
convex/schema.ts                        # Add broker tables
hooks/convex/index.ts                   # Export broker hooks
```

---

## Timeline Estimate

| Phase | Description         | Estimated Time |
| ----- | ------------------- | -------------- |
| 1     | Environment Setup   | 1-2 hours      |
| 2     | Database Schema     | 1-2 hours      |
| 3     | Convex Actions      | 4-6 hours      |
| 4     | Queries & Mutations | 2-3 hours      |
| 5     | Frontend Hooks      | 1-2 hours      |
| 6     | UI Components       | 4-6 hours      |
| 7     | OAuth Callback      | 1-2 hours      |
| 8     | Brokers Page        | 2-3 hours      |
| 9     | Error Handling      | 2-3 hours      |
| 10    | Testing             | 2-4 hours      |
| 11    | Webhooks (optional) | 2-3 hours      |

**Total: ~22-36 hours**

---

## References

- [SnapTrade API Documentation](https://docs.snaptrade.com/)
- [SnapTrade TypeScript SDK](https://github.com/passiv/snaptrade-sdks/tree/master/sdks/typescript)
- [Convex Actions Documentation](https://docs.convex.dev/functions/actions)
- [Fiscalis Architecture Guide](./ARCHITECTURE.md)
- [Financial Providers Architecture](./FINANCIAL_PROVIDERS_ARCHITECTURE.md)
