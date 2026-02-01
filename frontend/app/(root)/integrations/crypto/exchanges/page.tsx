"use client";

/**
 * Crypto Integrations - Exchanges Page
 *
 * Manage connected cryptocurrency exchanges (Coinbase, Binance, Kraken, etc.)
 */

import { CryptoConnectionsCard } from "@/components/atomic/molecules/crypto";

export default function CryptoIntegrationsExchangesPage() {
  return <CryptoConnectionsCard filterByCategory="exchange" />;
}
