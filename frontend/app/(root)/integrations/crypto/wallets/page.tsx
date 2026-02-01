"use client";

/**
 * Crypto Integrations - Wallets Page
 *
 * Manage connected cryptocurrency wallets (MetaMask, Ledger, etc.)
 */

import { CryptoConnectionsCard } from "@/components/atomic/molecules/crypto";

export default function CryptoIntegrationsWalletsPage() {
  return <CryptoConnectionsCard filterByCategory="wallet" />;
}
