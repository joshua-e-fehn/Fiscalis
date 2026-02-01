"use client";

/**
 * Crypto Integrations Layout
 *
 * Provides page header and context for crypto integrations.
 */

import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import { PageHeader } from "@/components/atomic/molecules/investments";
import {
  useSyncAllVezgoConnections,
  useVezgoConnections,
} from "@/hooks/convex/crypto";
import { useSyncContext } from "@/providers/syncProvider";
import { RefreshCw } from "lucide-react";

export default function CryptoIntegrationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { syncAll, isLoading: isLocalSyncing } = useSyncAllVezgoConnections();
  const { isVezgoSyncing: isGlobalSyncing } = useSyncContext();
  const connections = useVezgoConnections();

  // Show syncing state if either local or global sync is in progress
  const isSyncing = isLocalSyncing || isGlobalSyncing;

  const isLoading = connections === undefined;
  const hasConnections = connections && connections.length > 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <PageHeader
        title="Crypto Integrations"
        subtitle="Connect and manage your cryptocurrency exchanges and wallets"
        actionsLoading={isLoading}
        actions={
          hasConnections
            ? [
                {
                  label: "Sync",
                  onClick: () => syncAll(),
                  variant: "outline",
                  icon: RefreshCw,
                  isLoading: isSyncing,
                  loadingLabel: "Syncing...",
                  iconOnly: true,
                },
              ]
            : []
        }
        customActions={
          <VezgoConnectButton buttonVariant="default">
            Connect Crypto
          </VezgoConnectButton>
        }
      />

      {/* Page Content */}
      {children}
    </div>
  );
}
