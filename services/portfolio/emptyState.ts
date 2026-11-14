/**
 * Whether the dashboard should show its "connect your first account" empty
 * state (ENG-224): only once both queries have loaded and the user has no
 * connection and nothing entered by hand (no assets, no liabilities).
 * Undefined means still loading, so the empty state never flashes.
 */
export function isPortfolioEmpty(
  summary: { totalAssets: number; totalLiabilities: number } | null | undefined,
  connections:
    | { bankingCount: number; brokerCount: number; cryptoCount: number }
    | undefined,
): boolean {
  if (!summary || !connections) return false;
  const connected =
    connections.bankingCount + connections.brokerCount + connections.cryptoCount;
  return (
    connected === 0 && summary.totalAssets === 0 && summary.totalLiabilities === 0
  );
}
