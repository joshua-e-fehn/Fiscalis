"use client";

/**
 * IntegrationConnectionCard Component
 *
 * Unified card for displaying integration connections across banking, brokers, and crypto.
 * Shows connection logo, name, status, total value, and nested accounts.
 */

import { Card, CardContent, CardHeader } from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";
import { Clock } from "lucide-react";
import {
  IntegrationStatusBadge,
  type IntegrationStatus,
} from "./IntegrationStatusBadge";
import { IntegrationConnectionMenu } from "./IntegrationConnectionMenu";

// Helper function for time ago formatting
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

interface IntegrationConnectionCardProps {
  /** Institution/connection name */
  name: string;
  /** Logo URL */
  logo?: string;
  /** Fallback icon when no logo is available */
  fallbackIcon?: React.ReactNode;
  /** Connection status */
  status: IntegrationStatus;
  /** Total value across all accounts */
  totalValue: number;
  /** Total cash across all accounts (optional) */
  totalCash?: number;
  /** Currency code */
  currency: string;
  /** Last sync timestamp */
  lastSyncAt?: number;
  /** Error message to display */
  errorMessage?: string;
  /** Secondary info (e.g., "3 accounts", "5 positions") */
  secondaryInfo?: string;
  /** Called when sync is requested */
  onSync: () => void;
  /** Called when disconnect is confirmed */
  onDisconnect: () => void;
  /** Whether sync is in progress (local or global) */
  isSyncing?: boolean;
  /** Whether disconnect is in progress */
  isDisconnecting?: boolean;
  /** Nested accounts/positions to display */
  children?: React.ReactNode;
  /** Additional content to show in header (e.g., extra badges) */
  headerExtra?: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function IntegrationConnectionCard({
  name,
  logo,
  fallbackIcon,
  status,
  totalValue,
  totalCash,
  currency,
  lastSyncAt,
  errorMessage,
  secondaryInfo,
  onSync,
  onDisconnect,
  isSyncing = false,
  isDisconnecting = false,
  children,
  headerExtra,
  className,
}: IntegrationConnectionCardProps) {
  const formatAmount = (amount: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);

  const formattedValue = formatAmount(totalValue);
  // Show cash if it's > 0 (always show, even if equal to totalValue)
  const hasCash = totalCash !== undefined && totalCash > 0;

  // Determine effective status for display (syncing overrides other statuses)
  const effectiveStatus = isSyncing ? "syncing" : status;

  return (
    <Card className={cn("", className)}>
      <CardHeader className={cn(children ? "pb-3" : "pb-4")}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
              {logo ? (
                <img
                  src={logo}
                  alt={name}
                  className="h-full w-full object-contain"
                />
              ) : (
                fallbackIcon
              )}
            </div>

            {/* Connection Info */}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-lg truncate">{name}</h3>
                <IntegrationStatusBadge
                  status={effectiveStatus}
                  isSyncing={isSyncing}
                />
                {headerExtra}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {secondaryInfo && <span>{secondaryInfo}</span>}
                {secondaryInfo && lastSyncAt && <span>•</span>}
                {lastSyncAt && (
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTimeAgo(lastSyncAt)}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right side: Value + Menu */}
          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <p className="text-lg font-semibold">{formattedValue}</p>
              {hasCash && (
                <p className="text-xs text-muted-foreground">
                  {formatAmount(totalCash)} cash
                </p>
              )}
            </div>
            <IntegrationConnectionMenu
              connectionName={name}
              onSync={onSync}
              onDisconnect={onDisconnect}
              isSyncing={isSyncing}
              isDisconnecting={isDisconnecting}
              disconnectInfo={secondaryInfo}
            />
          </div>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="mt-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <p className="text-sm text-destructive">{errorMessage}</p>
          </div>
        )}
      </CardHeader>

      {/* Nested accounts/positions */}
      {children && (
        <CardContent className="pt-0">
          <div className="space-y-2">{children}</div>
        </CardContent>
      )}
    </Card>
  );
}

export default IntegrationConnectionCard;
