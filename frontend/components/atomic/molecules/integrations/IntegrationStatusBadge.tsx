"use client";

/**
 * IntegrationStatusBadge Component
 *
 * Unified status badge for all integration types (banking, brokers, crypto).
 * Displays connection status with consistent styling across pages.
 */

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  CheckCircle2,
  AlertCircle,
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
  | "needs_reauth" // Alias for reauth_required (Bitpanda uses this)
  | "transient_error" // Provider hiccup; the next sync retries
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
    /** Key under integrations.status */
    label:
      | "connected"
      | "syncing"
      | "error"
      | "reauthRequired"
      | "pending"
      | "retrying"
      | "disconnected";
    icon: React.ComponentType<{ className?: string }>;
    variant: "default" | "secondary" | "destructive" | "outline";
    className: string;
  }
> = {
  connected: {
    label: "connected",
    icon: CheckCircle2,
    variant: "outline",
    className: "text-green-600 border-green-600",
  },
  active: {
    label: "connected",
    icon: CheckCircle2,
    variant: "outline",
    className: "text-green-600 border-green-600",
  },
  syncing: {
    label: "syncing",
    icon: Loader2,
    variant: "outline",
    className: "text-blue-600 border-blue-600",
  },
  error: {
    label: "error",
    icon: AlertCircle,
    variant: "outline",
    className: "text-destructive border-destructive",
  },
  reauth_required: {
    label: "reauthRequired",
    icon: AlertTriangle,
    variant: "outline",
    className: "text-orange-600 border-orange-600",
  },
  needs_reauth: {
    label: "reauthRequired",
    icon: AlertTriangle,
    variant: "outline",
    className: "text-orange-600 border-orange-600",
  },
  transient_error: {
    label: "retrying",
    icon: Clock,
    variant: "outline",
    className: "text-yellow-600 border-yellow-600",
  },
  pending: {
    label: "pending",
    icon: Clock,
    variant: "outline",
    className: "text-yellow-600 border-yellow-600",
  },
  disconnected: {
    label: "disconnected",
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
  const t = useTranslations("integrations.status");
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
      {t(config.label)}
    </Badge>
  );
}

export default IntegrationStatusBadge;
