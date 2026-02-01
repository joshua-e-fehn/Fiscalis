"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  TrendingUp,
  MoreHorizontal,
  RefreshCw,
  Unlink,
  AlertCircle,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { Id } from "@/convex/_generated/dataModel";
import { useDeleteConnection, useSyncAll } from "@/hooks/convex";
import { BrokerAccountCard } from "@/components/atomic/atoms/brokerAccountCard";

// Type for broker connection from Convex
interface BrokerConnection {
  _id: Id<"brokerConnections">;
  brokerName: string;
  brokerSlug: string;
  brokerLogo?: string;
  status:
    | "connected"
    | "disconnected"
    | "error"
    | "pending"
    | "syncing"
    | "reauth_required";
  lastSyncAt?: number;
  errorMessage?: string;
}

// Type for broker account from Convex
interface BrokerAccount {
  _id: Id<"brokerAccounts">;
  connectionId: Id<"brokerConnections">;
  name: string;
  accountNumber?: string;
  accountType?: string;
  balance?: number;
  cash?: number;
  currency: string;
}

interface BrokerAccountsCardProps {
  connection: BrokerConnection;
  accounts: BrokerAccount[];
}

export function BrokerAccountsCard({
  connection,
  accounts,
}: BrokerAccountsCardProps) {
  const { deleteConnection, isLoading: isDeleting } = useDeleteConnection();
  const { syncAll, isLoading: isSyncing } = useSyncAll();
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);

  if (!accounts || accounts.length === 0) {
    return null;
  }

  const handleDisconnect = async () => {
    await deleteConnection(connection._id);
    setShowDisconnectDialog(false);
  };

  const handleRefresh = async () => {
    await syncAll();
  };

  const getStatusBadge = () => {
    switch (connection.status) {
      case "connected":
        return (
          <Badge variant="outline" className="text-green-600 border-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Connected
          </Badge>
        );
      case "syncing":
        return (
          <Badge variant="outline" className="text-blue-600 border-blue-600">
            <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
            Syncing
          </Badge>
        );
      case "reauth_required":
        return (
          <Badge
            variant="outline"
            className="text-orange-600 border-orange-600"
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Re-auth Required
          </Badge>
        );
      case "error":
        return (
          <Badge
            variant="outline"
            className="text-destructive border-destructive"
          >
            <AlertCircle className="h-3 w-3 mr-1" />
            Error
          </Badge>
        );
      case "pending":
        return (
          <Badge
            variant="outline"
            className="text-yellow-600 border-yellow-600"
          >
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="text-muted-foreground">
            <Clock className="h-3 w-3 mr-1" />
            Unknown
          </Badge>
        );
    }
  };

  const formatLastSync = () => {
    if (!connection.lastSyncAt) return "Never synced";
    const date = new Date(connection.lastSyncAt);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Calculate total portfolio value for this connection
  const totalValue = accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  // For broker accounts, cash can be in either `cash` field or `balance` field
  // (when account has no positions, all value is cash held in balance)
  const getEffectiveCash = (acc: BrokerAccount) => {
    if (acc.cash && acc.cash > 0) return acc.cash;
    // If cash is 0 or undefined, the balance itself might be the cash
    return acc.balance || 0;
  };
  const totalCash = accounts.reduce(
    (sum, acc) => sum + getEffectiveCash(acc),
    0,
  );
  const currency = accounts[0]?.currency || "USD";

  return (
    <>
      <Card className="mb-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {connection.brokerLogo ? (
                <img
                  src={connection.brokerLogo}
                  alt={connection.brokerName}
                  className="h-10 w-10 rounded-lg object-contain"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  {connection.brokerName}
                  {getStatusBadge()}
                </CardTitle>
                <CardDescription className="mt-0.5">
                  {accounts.length} account{accounts.length !== 1 ? "s" : ""} •
                  Last synced: {formatLastSync()}
                </CardDescription>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Portfolio value summary */}
              <div className="text-right mr-4 hidden sm:block">
                <div className="text-lg font-semibold">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency,
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(totalValue)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency,
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  }).format(totalCash)}{" "}
                  cash
                </div>
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreHorizontal className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={handleRefresh}
                    disabled={isSyncing}
                    className="cursor-pointer"
                  >
                    <RefreshCw
                      className={`mr-2 h-4 w-4 ${isSyncing ? "animate-spin" : ""}`}
                    />
                    {isSyncing ? "Syncing..." : "Refresh data"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => setShowDisconnectDialog(true)}
                    disabled={isDeleting}
                    className="cursor-pointer text-destructive focus:text-destructive"
                  >
                    <Unlink className="mr-2 h-4 w-4" />
                    Disconnect broker
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {connection.errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <p className="text-sm text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                {connection.errorMessage}
              </p>
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {accounts.map((account) => (
              <BrokerAccountCard key={account._id} account={account} />
            ))}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={showDisconnectDialog}
        onOpenChange={setShowDisconnectDialog}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Unlink className="h-5 w-5 text-destructive" />
              Disconnect {connection.brokerName}?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left">
              This will remove{" "}
              {accounts.length === 1
                ? "your connected account"
                : `all ${accounts.length} accounts`}{" "}
              and their position data from your dashboard.
              <br />
              <br />
              <span className="text-muted-foreground">
                Your actual brokerage account will not be affected. You can
                reconnect at any time.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
