"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
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
import { Badge } from "@/components/ui/shadcn/badge";
import {
  MoreHorizontal,
  RefreshCw,
  Trash2,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { useDeleteBrokerConnection } from "@/hooks/convex/brokers";
import { Id } from "@/convex/_generated/dataModel";

// Broker connection type from Convex
interface BrokerConnection {
  _id: Id<"brokerConnections">;
  connectionName: string;
  brokerType: string;
  status: "connected" | "disconnected" | "error" | "pending";
  accountId?: string;
  username?: string;
  lastSyncAt?: number;
  errorMessage?: string;
}

interface BrokerConnectionCardProps {
  connection: BrokerConnection;
}

export function BrokerConnectionCard({
  connection,
}: BrokerConnectionCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const deleteConnection = useDeleteBrokerConnection();

  const handleDelete = async () => {
    try {
      await deleteConnection.mutate(connection._id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error("Failed to delete broker:", error);
    }
  };

  const handleSync = async () => {
    // Sync functionality - just a placeholder for now
    console.log("Sync requested for:", connection._id);
  };

  const getStatusIcon = () => {
    switch (connection.status) {
      case "connected":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = () => {
    switch (connection.status) {
      case "connected":
        return (
          <Badge variant="outline" className="border-green-500 text-green-500">
            Connected
          </Badge>
        );
      case "error":
        return (
          <Badge variant="outline" className="border-red-500 text-red-500">
            Error
          </Badge>
        );
      case "pending":
        return (
          <Badge
            variant="outline"
            className="border-yellow-500 text-yellow-500"
          >
            Pending
          </Badge>
        );
      default:
        return null;
    }
  };

  const formatBrokerType = (type: string) => {
    return type
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const formatDate = (date: number | null | undefined) => {
    if (!date) return "Never";
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <>
      <Card className="relative overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  {connection.connectionName}
                  {getStatusIcon()}
                </CardTitle>
                <CardDescription className="text-sm">
                  {formatBrokerType(connection.brokerType)}
                </CardDescription>
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
                <DropdownMenuItem onClick={handleSync}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Sync Now
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowDeleteDialog(true)}
                  className="text-red-600 focus:bg-red-50 focus:text-red-600 dark:focus:bg-red-950"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Disconnect
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>

        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            {getStatusBadge()}
          </div>

          {connection.accountId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Account ID</span>
              <span className="text-sm font-medium">
                {connection.accountId}
              </span>
            </div>
          )}

          {connection.username && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Username</span>
              <span className="text-sm font-medium">{connection.username}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Last Synced</span>
            <span className="text-sm text-muted-foreground">
              {formatDate(connection.lastSyncAt)}
            </span>
          </div>

          {connection.status === "pending" && (
            <div className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 p-2 dark:border-yellow-900 dark:bg-yellow-950/20">
              <p className="text-xs text-yellow-800 dark:text-yellow-200">
                API integration pending. Data will sync once connected.
              </p>
            </div>
          )}

          {connection.errorMessage && connection.status === "error" && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-900 dark:bg-red-950/20">
              <p className="text-xs text-red-800 dark:text-red-200">
                {connection.errorMessage}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect Broker</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to disconnect &quot;
              {connection.connectionName}&quot;? This will remove the broker
              connection and all associated position data from your account.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 text-white hover:bg-red-700 focus:ring-red-600"
            >
              {deleteConnection.isLoading ? "Disconnecting..." : "Disconnect"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
