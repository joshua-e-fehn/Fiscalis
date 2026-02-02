"use client";

/**
 * Crypto Integrations - DeFi Page
 *
 * Manage connected DeFi protocols and positions.
 */

import { CryptoConnectionsCard } from "@/components/atomic/molecules/crypto";

export default function CryptoIntegrationsDeFiPage() {
  return <CryptoConnectionsCard filterByCategory="blockchain" />;
}
