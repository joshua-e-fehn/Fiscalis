"use client";

/**
 * Crypto Integrations - Wallets Page
 *
 * Manage connected cryptocurrency wallets (MetaMask, Ledger, etc.)
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import {
  useVezgoConnectionsByType,
  useSyncVezgoConnection,
  useDeleteVezgoConnection,
} from "@/hooks/convex/crypto";
import {
  Wallet,
  RefreshCw,
  Loader2,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";

// Simple time ago function
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export default function CryptoIntegrationsWalletsPage() {
  const wallets = useVezgoConnectionsByType("wallet");
  const { sync, isLoading: isSyncing } = useSyncVezgoConnection();
  const { deleteConnection, isLoading: isDeleting } =
    useDeleteVezgoConnection();
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleSync = async (connectionId: string) => {
    setSyncingId(connectionId);
    try {
      await sync(connectionId as any);
    } finally {
      setSyncingId(null);
    }
  };

  const handleDelete = async (connectionId: string) => {
    setDeletingId(connectionId);
    try {
      await deleteConnection(connectionId as any);
    } finally {
      setDeletingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <Badge
            variant="default"
            className="bg-green-500/10 text-green-500 border-green-500/20"
          >
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Active
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive">
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Wallet Connections</h2>
          <p className="text-sm text-muted-foreground">
            Manage your connected cryptocurrency wallets
          </p>
        </div>
        <VezgoConnectButton />
      </div>

      {/* Wallets List */}
      {wallets && wallets.length > 0 ? (
        <div className="grid gap-4">
          {wallets.map((wallet) => (
            <Card key={wallet._id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Wallet className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {wallet.name || wallet.provider}
                      </CardTitle>
                      <CardDescription>
                        Last synced:{" "}
                        {wallet.lastSyncAt
                          ? formatTimeAgo(wallet.lastSyncAt)
                          : "Never"}
                      </CardDescription>
                    </div>
                  </div>
                  {getStatusBadge(wallet.status)}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    Connected{" "}
                    {wallet._creationTime
                      ? formatTimeAgo(wallet._creationTime)
                      : ""}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSync(wallet._id)}
                      disabled={isSyncing && syncingId === wallet._id}
                    >
                      {isSyncing && syncingId === wallet._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      <span className="ml-2">Sync</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(wallet._id)}
                      disabled={isDeleting && deletingId === wallet._id}
                      className="text-destructive hover:text-destructive"
                    >
                      {isDeleting && deletingId === wallet._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Wallets Connected</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Connect your cryptocurrency wallets to automatically track your
              holdings.
            </p>
            <VezgoConnectButton />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
