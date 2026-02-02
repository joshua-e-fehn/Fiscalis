"use client";

/**
 * IntegrationEmptyState Component
 *
 * Standardized empty state display when no connections exist for an integration type.
 * Provides helpful messaging and a slot for the connect button.
 * Used across Banking, Brokers, and Crypto pages.
 */

import { Card, CardContent } from "@/components/ui/shadcn/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface IntegrationEmptyStateProps {
  /** Icon to display */
  icon: LucideIcon;
  /** Title text */
  title: string;
  /** Description text */
  description: string;
  /** Connect button (passed as children) */
  children: React.ReactNode;
  /** Additional class names */
  className?: string;
}

export function IntegrationEmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: IntegrationEmptyStateProps) {
  return (
    <Card className={cn("", className)}>
      <CardContent className="pt-6">
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="rounded-full bg-muted p-4 mb-4">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold mb-2">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-sm mb-6">
            {description}
          </p>
          {children}
        </div>
      </CardContent>
    </Card>
  );
}

export default IntegrationEmptyState;
