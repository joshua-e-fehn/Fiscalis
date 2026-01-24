# Fiscalis Frontend

A modern personal finance dashboard built with Next.js 16, featuring bank account aggregation via Plaid, precious metals tracking, and financial analytics.

## Features

- 🏦 **Bank Account Integration** - Connect and manage multiple bank accounts via Plaid
- 📊 **Financial Dashboard** - Real-time overview of your financial health
- 🥇 **Precious Metals Tracking** - Live gold, silver, platinum, and palladium prices
- 🔐 **Secure Authentication** - User authentication powered by Clerk
- 🌍 **Multi-Currency Support** - EUR and USD price tracking
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile

## Tech Stack

| Technology                                   | Purpose                                  |
| -------------------------------------------- | ---------------------------------------- |
| [Next.js 16](https://nextjs.org/)            | React framework with App Router          |
| [Hono](https://hono.dev/)                    | Lightweight API framework (Edge Runtime) |
| [Drizzle ORM](https://orm.drizzle.team/)     | Type-safe database access                |
| [Neon](https://neon.tech/)                   | Serverless PostgreSQL                    |
| [Clerk](https://clerk.com/)                  | Authentication & user management         |
| [TanStack Query](https://tanstack.com/query) | Server state management                  |
| [Plaid](https://plaid.com/)                  | Bank account aggregation                 |
| [shadcn/ui](https://ui.shadcn.com/)          | UI component library                     |
| [Tailwind CSS](https://tailwindcss.com/)     | Utility-first styling                    |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (recommended) or Node.js 18+
- PostgreSQL database (we use [Neon](https://neon.tech/))
- Plaid API credentials
- Clerk API credentials

### Environment Variables

Create a `.env.local` file with the following variables:

```bash
# Database
DATABASE_URL="postgresql://..."

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_..."
CLERK_SECRET_KEY="sk_..."
NEXT_PUBLIC_CLERK_SIGN_IN_URL="/sign-in"
NEXT_PUBLIC_CLERK_SIGN_UP_URL="/sign-up"

# Plaid
PLAID_CLIENT_ID="..."
PLAID_SANDBOX_SECRET="..."
PLAID_PRODUCTION_SECRET="..."
PLAID_ENV="sandbox"  # or "development" or "production"
PLAID_PRODUCTS="auth,transactions,identity"
PLAID_COUNTRY_CODES="US,DE,GB,FR,ES,IT"
```

### Installation

```bash
# Install dependencies
bun install

# Run database migrations
bun run db:migrate

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Project Structure

```
frontend/
├── app/                    # Next.js App Router
│   ├── (api)/              # API routes (Hono)
│   ├── (auth)/             # Auth pages (sign-in, sign-up)
│   ├── (root)/             # Protected app pages
│   │   ├── dashboard/      # Main dashboard
│   │   ├── banking/        # Bank accounts & transactions
│   │   ├── commodities/    # Precious metals prices
│   │   └── calculator/     # Financial calculators
│   └── (website)/          # Public marketing pages
├── components/
│   ├── atomic/             # Atomic design components
│   │   ├── atoms/          # Basic building blocks
│   │   ├── molecules/      # Component combinations
│   │   └── organisms/      # Complex UI sections
│   └── ui/                 # UI library (shadcn)
├── db/drizzle/             # Database schema & connection
├── hooks/                  # React Query hooks
├── lib/                    # Utilities & API functions
└── providers/              # React context providers
```

## Available Scripts

| Command               | Description                             |
| --------------------- | --------------------------------------- |
| `bun run dev`         | Start development server with Turbopack |
| `bun run build`       | Create production build                 |
| `bun run start`       | Start production server                 |
| `bun run lint`        | Run ESLint                              |
| `bun run db:generate` | Generate Drizzle migrations             |
| `bun run db:migrate`  | Run database migrations                 |
| `bun run db:studio`   | Open Drizzle Studio                     |

## API Routes

The API is built with Hono and runs on Edge Runtime:

| Method | Endpoint                               | Description              |
| ------ | -------------------------------------- | ------------------------ |
| POST   | `/api/banking/create-link-token`       | Create Plaid Link token  |
| POST   | `/api/banking/exchange-token`          | Exchange public token    |
| GET    | `/api/banking/accounts`                | Get linked bank accounts |
| DELETE | `/api/banking/items/:itemId`           | Disconnect a bank        |
| GET    | `/api/banking/transactions`            | Get transactions         |
| GET    | `/api/metals/:metal/prices/latest`     | Get latest metal price   |
| GET    | `/api/metals/:metal/prices/historical` | Get price history        |

## Architecture

For a detailed architecture overview, see the [Architecture Guide](../docs/ARCHITECTURE.md).

## Deployment

### Vercel (Recommended)

```bash
# Install Vercel CLI
bun add -g vercel

# Deploy
vercel
```

Make sure to configure all environment variables in the Vercel dashboard.

### Other Platforms

The app uses Edge Runtime for API routes, so ensure your hosting platform supports it (Vercel, Cloudflare Pages, etc.).

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is private and proprietary.
