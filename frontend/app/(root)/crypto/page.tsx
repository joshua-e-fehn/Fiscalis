"use client";

import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import {
  Bitcoin,
  Coins,
  CircleDollarSign,
  Layers,
  ArrowRight,
  TrendingUp,
  Wallet,
} from "lucide-react";

/**
 * Cryptocurrencies Overview Page
 *
 * Hub for all crypto investment types: Bitcoin, Ethereum, Altcoins,
 * Stablecoins, DeFi.
 */

interface CryptoCategory {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  implemented: boolean;
  examples: string[];
}

const cryptoCategories: CryptoCategory[] = [
  {
    title: "Bitcoin",
    description:
      "The original cryptocurrency - track your BTC holdings and transactions",
    href: "/crypto/bitcoin",
    icon: Bitcoin,
    implemented: false,
    examples: ["BTC Spot", "Bitcoin ETFs", "Wrapped BTC", "Lightning Network"],
  },
  {
    title: "Ethereum",
    description: "ETH and the Ethereum ecosystem including ERC-20 tokens",
    href: "/crypto/ethereum",
    icon: Coins,
    implemented: false,
    examples: ["ETH", "ERC-20 Tokens", "Staked ETH", "Layer 2"],
  },
  {
    title: "Altcoins",
    description: "Other major cryptocurrencies and blockchain platforms",
    href: "/crypto/altcoins",
    icon: Coins,
    implemented: false,
    examples: ["Solana", "Cardano", "Polkadot", "Avalanche"],
  },
  {
    title: "Stablecoins",
    description: "Price-stable cryptocurrencies pegged to fiat currencies",
    href: "/crypto/stablecoins",
    icon: CircleDollarSign,
    implemented: false,
    examples: ["USDT", "USDC", "DAI", "FRAX"],
  },
  {
    title: "DeFi",
    description:
      "Decentralized finance - staking, liquidity pools, and yield farming",
    href: "/crypto/defi",
    icon: Layers,
    implemented: false,
    examples: ["Staking", "Liquidity Pools", "Yield Farming", "Lending"],
  },
];

const CryptoCategoryCard = ({ category }: { category: CryptoCategory }) => {
  const Icon = category.icon;

  return (
    <Card
      className={`relative overflow-hidden transition-all ${
        category.implemented
          ? "hover:shadow-lg hover:border-primary cursor-pointer"
          : "opacity-60"
      }`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${
                category.implemented ? "bg-primary/10" : "bg-muted"
              }`}
            >
              <Icon
                className={`h-6 w-6 ${
                  category.implemented
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              />
            </div>
            <div>
              <CardTitle className="text-lg">{category.title}</CardTitle>
              {!category.implemented && (
                <span className="text-xs text-muted-foreground">
                  Coming soon
                </span>
              )}
            </div>
          </div>
          {category.implemented && (
            <TrendingUp className="h-5 w-5 text-green-500" />
          )}
        </div>
        <CardDescription className="mt-2">
          {category.description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2 mb-4">
          {category.examples.map((example) => (
            <span
              key={example}
              className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
            >
              {example}
            </span>
          ))}
        </div>
        {category.implemented ? (
          <Button asChild className="w-full">
            <Link href={category.href}>
              View Holdings
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        ) : (
          <Button disabled className="w-full" variant="outline">
            Coming Soon
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default function CryptoPage() {
  return (
    <div className="container mx-auto py-6 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Cryptocurrencies</h1>
        <p className="text-muted-foreground mt-2">
          Track your crypto portfolio - Bitcoin, Ethereum, altcoins,
          stablecoins, and DeFi positions.
        </p>
      </div>

      {/* Category Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {cryptoCategories.map((category) => (
          <CryptoCategoryCard key={category.title} category={category} />
        ))}
      </div>

      {/* Summary Section */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            Crypto Portfolio
          </CardTitle>
          <CardDescription>
            Connect your wallets and exchanges to automatically track all your
            cryptocurrency holdings, transactions, and DeFi positions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" disabled>
            Connect Wallet
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
          <Button variant="outline" asChild>
            <Link href="/brokers">
              Connect Broker
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
