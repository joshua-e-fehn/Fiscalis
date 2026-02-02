# Fiscalis

<div align="center">

**A comprehensive personal wealth management platform for tracking and analyzing your entire financial portfolio.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![Convex](https://img.shields.io/badge/Convex-Real--time-orange?style=flat-square)](https://convex.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-Runtime-f9f1e1?style=flat-square&logo=bun)](https://bun.sh/)

</div>

---

## Overview

Fiscalis is a modern wealth management dashboard that aggregates all your financial accounts into a single, unified view. Track bank accounts, brokerage portfolios, cryptocurrency holdings, precious metals, loans, and more — all with real-time updates and powerful analytics.

### Key Features

- 🏦 **Bank Account Integration** — Connect via Plaid for automatic balance and transaction sync
- 📈 **Brokerage Portfolio Tracking** — Support for 38+ brokers via SnapTrade (Interactive Brokers, Schwab, Fidelity, etc.)
- ₿ **Crypto Aggregation** — Track exchanges, wallets, DeFi positions, and NFTs via Vezgo
- 🥇 **Precious Metals Inventory** — Track physical gold, silver, platinum, and palladium holdings
- 💰 **Loan & Debt Management** — Amortization schedules, what-if scenarios, and payoff strategies
- 🌍 **World Economic Data** — World Bank indicators with interactive country comparisons
- 📊 **Portfolio Analytics** — Performance tracking, asset allocation charts, and historical snapshots
- 🔐 **Secure by Design** — AES-256-GCM encryption for sensitive tokens, Clerk authentication

---

## Architecture

Fiscalis uses a **hybrid architecture** optimized for different data patterns:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                         Next.js 16 + React 19                           │
│                                                                          │
│   Dashboard │ Banking │ Brokers │ Crypto │ Commodities │ Loans │ Maps   │
└──────────────────────────────┬───────────────────────────────────────────┘
                               │
         ┌─────────────────────┴─────────────────────┐
         │                                           │
         ▼                                           ▼
┌─────────────────────────┐             ┌─────────────────────────┐
│       CONVEX            │             │     HONO + NEON         │
│   (Real-time Backend)   │             │   (Time-series API)     │
├─────────────────────────┤             ├─────────────────────────┤
│ • User data (banking,   │             │ • Precious metal prices │
│   brokers, crypto)      │             │ • Exchange rates        │
│ • Portfolio snapshots   │             │ • World Bank data       │
│ • Loans & vault items   │             │                         │
│ • Onboarding progress   │             │ Drizzle ORM + PostgreSQL│
│                         │             │                         │
│ WebSocket subscriptions │             │ REST API (React Query)  │
└─────────────────────────┘             └─────────────────────────┘
         │
         ▼
┌─────────────────────────┐
│   EXTERNAL PROVIDERS    │
├─────────────────────────┤
│ • Plaid (Banking)       │
│ • SnapTrade (Brokers)   │
│ • Vezgo (Crypto)        │
│ • World Bank API        │
└─────────────────────────┘
```

**Why Hybrid?**

- **Convex** provides real-time reactivity for user data with automatic cache invalidation via WebSocket
- **Neon PostgreSQL** is better suited for time-series data with periodic batch updates

---

## Repository Structure

```
Fiscalis/
├── frontend/              # Next.js 16 application (main app)
│   ├── app/               # App Router pages and API routes
│   ├── convex/            # Convex backend (schemas, queries, mutations, actions)
│   ├── components/        # React components (Atomic Design)
│   ├── hooks/             # Data fetching hooks (Convex + React Query)
│   ├── db/                # Neon/Drizzle configuration
│   └── lib/               # Utilities and type definitions
│
├── services/              # Shared calculation services
│   ├── finance/           # Financial calculations (loans, interest, time-series)
│   └── performance/       # Portfolio performance calculation strategies
│
├── backend/               # Legacy backend services
│   └── edge_functions/    # Supabase edge functions (price fetching)
│
└── docs/                  # Architecture and specification documents
    ├── ARCHITECTURE.md    # Comprehensive architecture guide
    ├── LOANS_PAGE_SPEC.md # Loan calculator specification
    └── ...                # Other documentation
```

---

## Tech Stack

| Layer                 | Technology                     | Purpose                            |
| --------------------- | ------------------------------ | ---------------------------------- |
| **Frontend**          | Next.js 16, React 19           | App framework with App Router      |
| **Real-time Backend** | Convex                         | User data, WebSocket subscriptions |
| **API Layer**         | Hono (Edge Runtime)            | Time-series data endpoints         |
| **Database**          | Neon PostgreSQL + Drizzle      | Time-series storage                |
| **Auth**              | Clerk                          | Authentication & user management   |
| **State**             | TanStack Query                 | Server state for REST endpoints    |
| **UI**                | Tailwind CSS, shadcn/ui, Radix | Styling & components               |
| **Charts**            | Recharts                       | Data visualization                 |
| **Maps**              | MapLibre GL                    | Interactive world map              |
| **Financial APIs**    | Plaid, SnapTrade, Vezgo        | Account aggregation                |

---

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 20+
- [Convex](https://convex.dev/) account (free tier available)
- [Neon](https://neon.tech/) PostgreSQL database
- [Clerk](https://clerk.com/) account for authentication
- API credentials for: Plaid, SnapTrade, Vezgo (optional)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/yourusername/fiscalis.git
cd fiscalis

# Install dependencies for all packages
cd frontend && bun install
cd ../services && bun install

# Set up environment variables
cp frontend/.env.example frontend/.env.local
# Edit .env.local with your credentials

# Initialize Convex
cd frontend
bunx convex dev

# In a new terminal, start the development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Environment Variables

See [frontend/README.md](./frontend/README.md) for required environment variables.

---

## Documentation

| Document                                          | Description                       |
| ------------------------------------------------- | --------------------------------- |
| [Architecture Guide](./docs/ARCHITECTURE.md)      | Comprehensive system architecture |
| [Frontend README](./frontend/README.md)           | Frontend setup and development    |
| [Services README](./services/README.md)           | Shared calculation services       |
| [Convex README](./frontend/convex/README.md)      | Backend queries and mutations     |
| [Loan Calculator Spec](./docs/LOANS_PAGE_SPEC.md) | Loan calculator specification     |

---

## Development

### Running Tests

```bash
# Run services tests
cd services
bun test

# Run specific test file
bun test finance/financeService.test.ts
```

### Database Migrations

```bash
# Generate new migration
cd frontend
bun run db:generate

# Apply migrations
bun run db:migrate

# Open Drizzle Studio
bun run db:studio
```

### Convex Development

```bash
# Start Convex dev server (watches for changes)
bunx convex dev

# Deploy to production
bunx convex deploy

# Run a one-off function
bunx convex run functionName
```

---

## Deployment

### Vercel (Recommended)

The frontend is optimized for Vercel deployment:

```bash
cd frontend
vercel
```

Configure environment variables in the Vercel dashboard.

### Convex

Convex automatically deploys when you run `bunx convex deploy`.

---

## Security

- **Token Encryption**: All sensitive tokens (Plaid access tokens, Vezgo user tokens) are encrypted at rest using AES-256-GCM
- **Authentication**: All routes protected by Clerk authentication
- **Row-Level Security**: Convex queries filter by authenticated user ID
- **HTTPS Only**: All external API calls use HTTPS

---

## License

This project is private and proprietary.

---

<div align="center">
  <sub>Built with ❤️ for personal wealth management</sub>
</div>
