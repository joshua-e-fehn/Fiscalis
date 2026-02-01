"use client";

/**
 * CryptoConnectionsCard Component
 *
 * Displays a list of connected crypto exchanges and wallets
 * with their status and quick actions.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
  useVezgoConnections,
  useDeleteVezgoConnection,
  useSyncVezgoConnection,
} from "@/hooks/convex/crypto";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import {
  Building2,
  Wallet,
  Link2,
  HardDrive,
  MoreVertical,
  RefreshCw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Id } from "@/convex/_generated/dataModel";

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

const providerTypeIcons = {
  exchange: Building2,
  wallet: Wallet,
  blockchain: Link2,
  hardware: HardDrive,
};

const statusConfig = {
  active: {
    label: "Connected",
    icon: CheckCircle2,
    variant: "default" as const,
    className: "text-green-500",
  },
  syncing: {
    label: "Syncing",
    icon: Loader2,
    variant: "secondary" as const,
    className: "text-blue-500 animate-spin",
  },
  error: {
    label: "Error",
    icon: AlertCircle,
    variant: "destructive" as const,
    className: "text-destructive",
  },
  disconnected: {
    label: "Disconnected",
    icon: AlertCircle,
    variant: "outline" as const,
    className: "text-muted-foreground",
  },
};

interface CryptoConnectionsCardProps {
  className?: string;
  limit?: number;
  showAddButton?: boolean;
}

export function CryptoConnectionsCard({
  className,
  limit,
  showAddButton = true,
}: CryptoConnectionsCardProps) {
  const connections = useVezgoConnections();
  const { deleteConnection, isLoading: isDeleting } =
    useDeleteVezgoConnection();
  const { sync, isLoading: isSyncing } = useSyncVezgoConnection();

  const displayedConnections = limit
    ? connections?.slice(0, limit)
    : connections;

  const hasMore = limit && connections && connections.length > limit;

  return (
    <Card className={cn("h-fit", className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Connected Accounts</CardTitle>
            <CardDescription>
              {connections?.length || 0} exchange
              {connections?.length !== 1 ? "s" : ""} & wallet
              {connections?.length !== 1 ? "s" : ""} connected
            </CardDescription>
          </div>
          {showAddButton && <VezgoConnectButton variant="default" size="sm" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {!connections ? (
          // Loading state
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 animate-pulse"
              >
                <div className="h-10 w-10 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-muted rounded" />
                  <div className="h-3 w-16 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : connections.length === 0 ? (
          // Empty state
          <div className="text-center py-8 space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Wallet className="h-6 w-6 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm font-medium">No accounts connected</p>
              <p className="text-xs text-muted-foreground">
                Connect your crypto exchanges and wallets to start tracking
              </p>
            </div>
            <VezgoConnectButton variant="default" size="sm" />
          </div>
        ) : (
          // Connections list
          <>
            {displayedConnections?.map((connection) => {
              const status = statusConfig[connection.status];
              const TypeIcon = providerTypeIcons[connection.providerType];
              const StatusIcon = status.icon;

              return (
                <div
                  key={connection._id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  {/* Provider Icon/Logo */}
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center overflow-hidden">
                    {connection.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={connection.logo}
                        alt={connection.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <TypeIcon className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>

                  {/* Connection Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium truncate">{connection.name}</p>
                      <Badge variant={status.variant} className="text-xs h-5">
                        <StatusIcon
                          className={cn("h-3 w-3 mr-1", status.className)}
                        />
                        {status.label}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span className="capitalize">
                        {connection.providerType}
                      </span>
                      {connection.lastSyncAt && (
                        <>
                          <span>•</span>
                          <Clock className="h-3 w-3" />
                          <span>{formatTimeAgo(connection.lastSyncAt)}</span>
                        </>
                      )}
                    </div>
                    {connection.errorMessage && (
                      <p className="text-xs text-destructive truncate mt-1">
                        {connection.errorMessage}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => sync(connection._id)}
                        disabled={isSyncing}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync Now
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => deleteConnection(connection._id)}
                        disabled={isDeleting}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Disconnect
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}

            {hasMore && (
              <Button variant="ghost" className="w-full" size="sm">
                View all {connections.length} connections
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default CryptoConnectionsCard;
