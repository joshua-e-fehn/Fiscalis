import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/shadcn/button";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { Plus, Loader2, type LucideIcon } from "lucide-react";

export interface PageHeaderAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline" | "secondary" | "ghost" | "link";
  disabled?: boolean;
  icon?: LucideIcon;
  isLoading?: boolean;
  loadingLabel?: string;
  /** If true, only show the icon (no label text) */
  iconOnly?: boolean;
}

interface PageHeaderProps {
  title: string;
  subtitle: string;
  actions?: PageHeaderAction[];
  /** Custom React nodes to render in the actions area (e.g., complex connect buttons) */
  customActions?: React.ReactNode;
  /** Show skeleton loading state for actions */
  actionsLoading?: boolean;
}

/**
 * PageHeader Component
 *
 * Reusable header component for investment/asset pages.
 * Displays title, subtitle, and optional action buttons aligned to the right.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  customActions,
  actionsLoading,
}: PageHeaderProps) {
  return (
    <div className="flex w-full items-center justify-between pt-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-2">{subtitle}</p>
      </div>
      {actionsLoading ? (
        <div className="flex gap-2 items-center">
          <Skeleton className="h-10 w-10 rounded-md" />
          <Skeleton className="h-10 w-32 rounded-md" />
        </div>
      ) : (actions && actions.length > 0) || customActions ? (
        <div className="flex gap-2 items-center">
          {actions?.map((action, index) => {
            const isLast = index === actions.length - 1 && !customActions;
            const variant = action.variant ?? (isLast ? "default" : "outline");
            const Icon = action.isLoading ? Loader2 : (action.icon ?? Plus);
            const displayLabel = action.isLoading
              ? (action.loadingLabel ?? action.label)
              : action.label;

            if (action.href && !action.isLoading) {
              return (
                <Button
                  key={action.label}
                  asChild
                  variant={variant}
                  disabled={action.disabled}
                  size={action.iconOnly ? "icon" : "default"}
                >
                  <Link href={action.href}>
                    <Icon
                      className={action.iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"}
                    />
                    {!action.iconOnly && displayLabel}
                  </Link>
                </Button>
              );
            }

            return (
              <Button
                key={action.label}
                variant={variant}
                onClick={action.onClick}
                disabled={action.disabled || action.isLoading}
                size={action.iconOnly ? "icon" : "default"}
              >
                <Icon
                  className={`${action.iconOnly ? "h-4 w-4" : "mr-2 h-4 w-4"} ${action.isLoading ? "animate-spin" : ""}`}
                />
                {!action.iconOnly && displayLabel}
              </Button>
            );
          })}
          {customActions}
        </div>
      ) : null}
    </div>
  );
}
