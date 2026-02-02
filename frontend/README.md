# Fiscalis Frontend

<div align="center">

**The Next.js 16 frontend application for Fiscalis — a comprehensive personal wealth management platform.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Convex](https://img.shields.io/badge/Convex-Backend-orange?style=flat-square)](https://convex.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)

</div>

---

## Overview

This is the main frontend application for Fiscalis, built with Next.js 16 and the App Router. It includes:

- **React 19** with Server Components and the latest features
- **Convex** real-time backend for user data (embedded in `/convex` directory)
- **Hono** API routes for time-series data (precious metals, exchange rates)
- **Clerk** authentication with protected routes
- **TanStack Query** for REST API state management

---

## Features

| Feature                | Description                                                               |
| ---------------------- | ------------------------------------------------------------------------- |
| 🏦 **Banking**         | Connect bank accounts via Plaid, view balances and transactions           |
| 📈 **Brokers**         | Track 38+ brokerage accounts via SnapTrade (IBKR, Schwab, Fidelity, etc.) |
| ₿ **Crypto**           | Aggregate exchanges, wallets, DeFi, and NFTs via Vezgo                    |
| 🥇 **Precious Metals** | Track physical gold, silver, platinum inventory with live prices          |
| 💰 **Loans**           | Loan calculator with amortization schedules and what-if scenarios         |
| 🌍 **World Map**       | Interactive economic indicators from World Bank API                       |
| 📊 **Dashboard**       | Unified portfolio view with allocation charts and performance metrics     |
| 🔄 **Onboarding**      | Step-by-step guided setup for new users                                   |

---

## Tech Stack

### Core Framework

| Technology     | Version | Purpose                              |
| -------------- | ------- | ------------------------------------ |
| **Next.js**    | ^16.1.4 | React framework with App Router      |
| **React**      | ^19.2.3 | UI library with Server Components    |
| **TypeScript** | ^5.9.3  | Type-safe JavaScript                 |
| **Bun**        | latest  | JavaScript runtime & package manager |

### Backend (Convex)

| Technology             | Version | Purpose                                    |
| ---------------------- | ------- | ------------------------------------------ |
| **Convex**             | ^1.31.6 | Real-time backend, database, and functions |
| **convex/react**       | -       | React hooks for queries/mutations          |
| **convex/react-clerk** | -       | Clerk authentication integration           |

### API Layer

| Technology           | Version | Purpose                           |
| -------------------- | ------- | --------------------------------- |
| **Hono**             | ^4.11.5 | Edge-compatible API framework     |
| **@hono/clerk-auth** | ^2.0.1  | Clerk middleware for Hono         |
| **Drizzle ORM**      | ^0.31.4 | Type-safe SQL for Neon PostgreSQL |

### UI & Styling

| Technology        | Version  | Purpose                       |
| ----------------- | -------- | ----------------------------- |
| **Tailwind CSS**  | ^3.4.19  | Utility-first CSS             |
| **shadcn/ui**     | -        | Accessible component library  |
| **Radix UI**      | various  | Headless UI primitives        |
| **Framer Motion** | ^11.18.2 | Animations                    |
| **Recharts**      | ^2.15.4  | Charts and data visualization |
| **MapLibre GL**   | ^5.16.0  | Interactive maps              |

### Financial Integrations

| Technology    | Version  | Purpose                                       |
| ------------- | -------- | --------------------------------------------- |
| **Plaid**     | ^31.1.0  | Banking data aggregation                      |
| **SnapTrade** | ^9.0.160 | Brokerage account aggregation                 |
| **Vezgo**     | ^2.0.3   | Crypto aggregation (exchanges, wallets, DeFi) |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) v1.0+ (recommended) or Node.js 20+
- [Convex](https://convex.dev/) account
- [Neon](https://neon.tech/) PostgreSQL database
- [Clerk](https://clerk.com/) account

### Environment Variables

Create a `.env.local` file in the frontend directory:

```bash
# ===========================================
# Convex
# ===========================================
CONVEX_DEPLOYMENT="your-deployment-name"
NEXT_PUBLIC_CONVEX_URL="https://your-deployment.convex.cloud"

# ===========================================
# Clerk Authentication
# ===========================================
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"

# ===========================================
# Neon PostgreSQL (for time-series data)
# ===========================================
DATABASE_URL="postgresql://..."

# ===========================================
# Plaid (Banking Integration)
# ===========================================
PLAID_CLIENT_ID="..."
PLAID_SECRET="..."  # Use sandbox/development/production secret
PLAID_ENV="sandbox"  # sandbox | development | production
PLAID_PRODUCTS="auth,transactions,identity,investments"
PLAID_COUNTRY_CODES="US,DE,GB,FR,ES,IT"

# ===========================================
# SnapTrade (Brokerage Integration)
# ===========================================
SNAPTRADE_CLIENT_ID="..."
SNAPTRADE_CONSUMER_KEY="..."

# ===========================================
# Vezgo (Crypto Integration)
# ===========================================
VEZGO_CLIENT_ID="..."
VEZGO_CLIENT_SECRET="..."

# ===========================================
# Encryption Key (for token storage)
# ===========================================
ENCRYPTION_KEY="..."  # 32-byte hex key for AES-256-GCM
```

### Installation

```bash
# Install dependencies
bun install

# Start Convex development server (in one terminal)
bunx convex dev

# Start Next.js development server (in another terminal)
bun run dev

# Run database migrations (for Neon/Drizzle)
bun run db:migrate
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

---

## Project Structure

```
frontend/
├── app/                          # Next.js App Router
│   ├── globals.css               # Global styles
│   ├── layout.tsx                # Root layout
│   ├── (api)/                    # API route group
│   │   └── api/
│   │       ├── [[...route]]/     # Hono catch-all routes
│   │       │   ├── route.ts      # Hono app entry
│   │       │   ├── metals.ts     # Precious metals endpoints
│   │       │   ├── worlddata.ts  # World Bank endpoints
│   │       │   └── worldbank-sync.ts
│   │       └── vezgo/            # Vezgo webhooks
│   ├── (auth)/                   # Authentication pages
│   │   ├── sign-in/
│   │   └── sign-up/
│   ├── (onboarding)/             # Onboarding flow
│   │   └── onboarding/
│   ├── (root)/                   # Protected app pages
│   │   ├── dashboard/            # Main dashboard
│   │   ├── assets/               # Asset management
│   │   │   ├── bonds/
│   │   │   ├── cash/
│   │   │   ├── collectibles/
│   │   │   ├── commodities/      # Precious metals inventory
│   │   │   ├── crypto/
│   │   │   ├── equities/
│   │   │   └── real-estate/
│   │   ├── integrations/         # Provider connections
│   │   │   ├── banking/          # Plaid connections
│   │   │   ├── brokers/          # SnapTrade connections
│   │   │   └── crypto/           # Vezgo connections
│   │   ├── liabilities/
│   │   │   └── loans/            # Loan management
│   │   └── tools/
│   │       ├── calculators/
│   │       └── world-map/
│   └── (website)/                # Public marketing pages
│
├── convex/                       # Convex Backend
│   ├── _generated/               # Auto-generated types
│   ├── actions/                  # External API calls
│   │   ├── plaid.ts              # Plaid integration
│   │   ├── snaptrade.ts          # SnapTrade integration
│   │   ├── vezgo.ts              # Vezgo integration
│   │   └── syncAll.ts            # Sync all providers
│   ├── lib/                      # Utilities
│   │   ├── encryption.ts         # AES-256-GCM encryption
│   │   └── vezgo.ts              # Vezgo helpers
│   ├── schema.ts                 # Database schema
│   ├── banking.ts                # Banking queries/mutations
│   ├── brokers.ts                # Broker queries/mutations
│   ├── crypto.ts                 # Crypto queries/mutations
│   ├── categories.ts             # Category-based queries
│   ├── classification.ts         # Classification overrides
│   ├── loans.ts                  # Loan management
│   ├── vault.ts                  # Precious metals inventory
│   ├── portfolio.ts              # Portfolio aggregation
│   ├── portfolioSnapshots.ts     # Historical tracking
│   ├── worldbank.ts              # World Bank indicators
│   ├── onboarding.ts             # Onboarding progress
│   └── crons.ts                  # Scheduled jobs
│
├── components/
│   ├── ConvexClientProvider.tsx  # Convex + Clerk provider
│   ├── atomic/                   # Atomic Design Pattern
│   │   ├── atoms/                # Basic building blocks
│   │   ├── molecules/            # Component combinations
│   │   └── organisms/            # Complex UI sections
│   └── ui/                       # UI library components
│       └── shadcn/               # shadcn/ui components
│
├── hooks/
│   ├── convex/                   # Convex real-time hooks
│   │   ├── banking.ts            # Plaid data hooks
│   │   ├── brokers.ts            # SnapTrade data hooks
│   │   ├── crypto.ts             # Vezgo data hooks
│   │   ├── cash.ts               # Cash summary
│   │   ├── equities.ts           # Equities summary
│   │   ├── bonds.ts              # Bonds summary
│   │   ├── loans.ts              # Loan hooks
│   │   ├── metals.ts             # Metals vault hooks
│   │   ├── portfolio.ts          # Portfolio aggregation
│   │   └── onboarding.ts         # Onboarding hooks
│   ├── metals.ts                 # Metal prices (React Query)
│   ├── worldbank.ts              # World Bank data hooks
│   ├── useVezgoConnect.ts        # Vezgo connect URL
│   └── useTimePlayback.ts        # Historical playback
│
├── db/drizzle/                   # Neon database
│   ├── drizzle.ts                # DB connection
│   └── schema.ts                 # Time-series tables
│
├── drizzle/                      # Migration files
│   └── *.sql
│
├── lib/
│   ├── api/                      # API fetch functions
│   │   └── metals.ts
│   ├── types/                    # TypeScript definitions
│   │   ├── metals.ts
│   │   └── classification.ts     # Investment categories
│   ├── hono.ts                   # Hono client setup
│   └── utils.ts                  # General utilities
│
├── providers/
│   ├── queryProvider.tsx         # TanStack Query provider
│   └── syncProvider.tsx          # Data sync provider
│
└── public/
    └── data/                     # Static data files
```

---

## Available Scripts

| Command               | Description                          |
| --------------------- | ------------------------------------ |
| `bun run dev`         | Start development server (Turbopack) |
| `bun run build`       | Create production build              |
| `bun run start`       | Start production server              |
| `bun run lint`        | Run ESLint                           |
| `bun run db:generate` | Generate Drizzle migrations          |
| `bun run db:migrate`  | Run database migrations              |
| `bun run db:studio`   | Open Drizzle Studio                  |

### Convex Commands

| Command                 | Description                                   |
| ----------------------- | --------------------------------------------- |
| `bunx convex dev`       | Start Convex dev server (watches for changes) |
| `bunx convex deploy`    | Deploy to production                          |
| `bunx convex run <fn>`  | Run a one-off function                        |
| `bunx convex dashboard` | Open Convex dashboard                         |

---

## API Routes

### Hono API (Time-series Data)

| Method | Endpoint                                    | Description                  |
| ------ | ------------------------------------------- | ---------------------------- |
| GET    | `/api/metals/:metal/prices/latest`          | Latest price for a metal     |
| GET    | `/api/metals/:metal/prices/historical`      | Historical prices by range   |
| GET    | `/api/metals/:metal/prices/range`           | Prices for custom date range |
| GET    | `/api/world-data/indicators/:code/:country` | World Bank indicator         |
| POST   | `/api/worldbank/sync`                       | Trigger indicator sync       |

### Convex Queries (Real-time)

| Module       | Key Functions                                              |
| ------------ | ---------------------------------------------------------- |
| `banking`    | `getItems`, `getAccounts`, `getTransactions`               |
| `brokers`    | `getConnections`, `getAccounts`, `getPositions`            |
| `crypto`     | `getConnections`, `getPositions`, `getTransactions`        |
| `categories` | `getCashHoldings`, `getEquitiesHoldings`, `getLiabilities` |
| `portfolio`  | `getPortfolioSummary`, `getAssetAllocation`                |
| `loans`      | `getLoans`, `getLoanDetails`, `getScenarios`               |
| `vault`      | `getVaultItems`, `getVaultTransactions`                    |

---

## Data Flow

### Real-time Data (Convex)

```
Component → useQuery(api.banking.getAccounts)
    │
    └──→ Convex Backend → WebSocket subscription
                              │
                              └──→ Auto-updates on data change
```

### Time-series Data (Hono + React Query)

```
Component → useMetalPrices("gold", "1D")
    │
    └──→ React Query → fetch("/api/metals/gold/prices/latest")
                              │
                              └──→ Hono → Drizzle → Neon PostgreSQL
```

---

## Investment Categories

Fiscalis uses a unified classification system for all assets:

| Category         | Subcategories                                                            |
| ---------------- | ------------------------------------------------------------------------ |
| **cash**         | checking, savings, money-market, cds, treasury-bills, forex, broker-cash |
| **equities**     | stocks, etfs, funds, options, private                                    |
| **bonds**        | government, corporate, municipal, savings, funds                         |
| **crypto**       | bitcoin, ethereum, altcoins, stablecoins, defi, nfts                     |
| **commodities**  | metals, energy, industrial, agricultural                                 |
| **real-estate**  | residential, commercial, reits, crowdfunding, land                       |
| **collectibles** | art, watches, wine, cars, memorabilia                                    |
| **liabilities**  | mortgages, loans, credit-cards, margin-loans                             |

---

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
bun add -g vercel

# Deploy
vercel
```

Configure environment variables in the Vercel dashboard.

### Requirements

- Edge Runtime support (for Hono API routes)
- Environment variables configured
- Convex deployment linked

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting (`bun run lint`)
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

---

## Architecture Reference

For detailed architecture documentation, see:

- [Architecture Guide](../docs/ARCHITECTURE.md) — Comprehensive system overview
- [Convex README](./convex/README.md) — Convex function patterns
- [Loan Spec](../docs/LOANS_PAGE_SPEC.md) — Loan calculator specification

---

## License

This project is private and proprietary.
