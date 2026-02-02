# Fiscalis Backend

<div align="center">

**Legacy backend services for the Fiscalis platform.**

[![Supabase](https://img.shields.io/badge/Supabase-Edge%20Functions-3ECF8E?style=flat-square&logo=supabase)](https://supabase.com/)
[![Deno](https://img.shields.io/badge/Deno-Runtime-000000?style=flat-square&logo=deno)](https://deno.land/)

</div>

---

## ⚠️ Deprecation Notice

> **Note:** This backend is being phased out in favor of **Convex** for real-time user data and **Hono API routes** for time-series data. New features should be implemented in the `frontend/convex/` directory or as Hono API routes in `frontend/app/(api)/`.

---

## Overview

This directory contains legacy Supabase Edge Functions that were used for scheduled data fetching tasks. These functions run on Deno runtime and are deployed to Supabase.

### Current Functions

| Function                                                | Purpose                                                   | Status    |
| ------------------------------------------------------- | --------------------------------------------------------- | --------- |
| `fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate` | Fetches precious metal prices and currency exchange rates | 🔄 Legacy |

---

## Structure

```
backend/
└── edge_functions/
    └── supabase/
        ├── config.toml              # Supabase local config
        ├── seed.sql                 # Database seed data
        ├── migrations/              # Database migrations
        └── functions/
            └── fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate/
                └── index.ts         # Edge function handler
```

---

## Edge Functions

### Precious Metal Prices & Exchange Rates

This edge function fetches current prices for:

- **Gold** (XAU)
- **Silver** (XAG)
- **Platinum** (XPT)
- **Palladium** (XPD)
- **EUR/USD Exchange Rate**

The data is stored in the Neon PostgreSQL database for use by the frontend's time-series API.

#### Deployment

```bash
# Navigate to the supabase directory
cd backend/edge_functions/supabase

# Deploy the function
supabase functions deploy fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate

# Set up a cron job (via Supabase Dashboard or pg_cron)
# Recommended: Run every 15 minutes during market hours
```

#### Environment Variables

The function requires these secrets:

```bash
# Set via Supabase CLI
supabase secrets set METAL_PRICES_API_KEY="your-api-key"
supabase secrets set DATABASE_URL="postgresql://..."
```

---

## Local Development

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli)
- [Deno](https://deno.land/) (installed automatically by Supabase CLI)

### Running Locally

```bash
# Start local Supabase services
cd backend/edge_functions/supabase
supabase start

# Serve functions locally
supabase functions serve

# Test a function
curl -i --location --request POST 'http://localhost:54321/functions/v1/fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate' \
  --header 'Authorization: Bearer YOUR_ANON_KEY'
```

### Database Migrations

```bash
# Create a new migration
supabase migration new my_migration_name

# Apply migrations locally
supabase db reset

# Push migrations to remote
supabase db push
```

---

## Migration to Convex

The primary backend has been migrated to **Convex**, which provides:

- ✅ Real-time data synchronization via WebSocket
- ✅ Automatic TypeScript code generation
- ✅ Built-in authentication integration (Clerk)
- ✅ Scheduled functions (crons)
- ✅ Better developer experience

### Where to Add New Features

| Feature Type                         | Location                   |
| ------------------------------------ | -------------------------- |
| User data (banking, brokers, crypto) | `frontend/convex/`         |
| Time-series API endpoints            | `frontend/app/(api)/api/`  |
| Scheduled tasks                      | `frontend/convex/crons.ts` |
| External API integrations            | `frontend/convex/actions/` |

### Convex Scheduled Jobs

Scheduled jobs that replace edge functions are defined in:

```typescript
// frontend/convex/crons.ts
import { cronJobs } from "convex/server";

const crons = cronJobs();

// Example: Daily portfolio snapshots
crons.daily(
  "daily-portfolio-snapshot",
  { hourUTC: 0, minuteUTC: 0 },
  internal.portfolioSnapshots.createDailySnapshots,
);

export default crons;
```

---

## Configuration

### Supabase Config (`config.toml`)

Key settings:

```toml
[api]
port = 54321
schemas = ["public", "graphql_public"]

[db]
port = 54322
major_version = 15

[realtime]
enabled = true

[studio]
enabled = true
port = 54323
```

---

## Troubleshooting

### Common Issues

**Function not deploying:**

```bash
# Check function logs
supabase functions logs fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate

# Verify function syntax
deno check backend/edge_functions/supabase/functions/fetchAndSafePreciousMetalPricesAndCurrenyExchangeRate/index.ts
```

**Database connection issues:**

```bash
# Test connection locally
supabase db reset
supabase status
```

---

## License

This project is private and proprietary.
