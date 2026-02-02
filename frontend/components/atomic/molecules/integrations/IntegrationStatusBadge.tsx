"use client";

/**
 * IntegrationStatusBadge Component
 *
 * Unified status badge for all integration types (banking, brokers, crypto).
 * Displays connection status with consistent styling across pages.
 */

import { Badge } from "@/components/ui/shadcn/badge";
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Clock,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type IntegrationStatus =
  | "connected"
  | "active" // Alias for connected (crypto uses this)
  | "syncing"
  | "error"
  | "reauth_required"
  | "pending"
  | "disconnected";

interface IntegrationStatusBadgeProps {
  status: IntegrationStatus;
  /** Override to show syncing state (e.g., from global sync context) */
  isSyncing?: boolean;
  className?: string;
}

const statusConfig: Record<
  IntegrationStatus,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
  }
> = {
  connected: {
    label: "Connected",
    icon: CheckCircle2,
    variant: "outline",
    className: "text-green-600 border-green-600",
  },
  active: {
    label: "Connected",
    icon: CheckCircle2,
    variant: "outline",
    className: "text-green-600 border-green-600",
  },
  syncing: {
    label: "Syncing",
    icon: Loader2,
    variant: "outline",
    className: "text-blue-600 border-blue-600",
  },
  error: {
    label: "Error",
    icon: AlertCircle,
    variant: "outline",
    className: "text-destructive border-destructive",
  },
  reauth_required: {
    label: "Re-auth Required",
    icon: AlertTriangle,
    variant: "outline",
    className: "text-orange-600 border-orange-600",
  },
  pending: {
    label: "Pending",
    icon: Clock,
    variant: "outline",
    className: "text-yellow-600 border-yellow-600",
  },
  disconnected: {
    label: "Disconnected",
    icon: AlertCircle,
    variant: "outline",
    className: "text-muted-foreground border-muted-foreground",
  },
};

export function IntegrationStatusBadge({
  status,
  isSyncing,
  className,
}: IntegrationStatusBadgeProps) {
  // If global/external syncing is active, show syncing status
  const effectiveStatus = isSyncing ? "syncing" : status;
  const config = statusConfig[effectiveStatus];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={cn(config.className, className)}>
      <Icon
        className={cn(
          "h-3 w-3 mr-1",
          effectiveStatus === "syncing" && "animate-spin",
        )}
      />
      {config.label}
    </Badge>
  );
}

export default IntegrationStatusBadge;
