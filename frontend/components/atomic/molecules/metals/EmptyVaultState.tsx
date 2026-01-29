"use client";

import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { cn } from "@/lib/utils";
import { Coins, Plus, ArrowRight } from "lucide-react";

interface EmptyVaultStateProps {
  onAddFromCatalog: () => void;
  onAddCustom: () => void;
  popularItems?: Array<{
    id: string;
    name: string;
    metal: string;
  }>;
  onQuickAdd?: (id: string) => void;
  className?: string;
}

export function EmptyVaultState({
  onAddFromCatalog,
  onAddCustom,
  popularItems,
  onQuickAdd,
  className,
}: EmptyVaultStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12",
        className,
      )}
    >
      <div className="flex flex-col items-center text-center max-w-md">
        {/* Icon */}
        <div className="w-16 h-16 rounded-full bg-metal-gold/10 flex items-center justify-center mb-4">
          <Coins className="h-8 w-8 text-metal-gold-muted" />
        </div>

        {/* Title & Description */}
        <h2 className="text-xl font-semibold mb-2">Your vault is empty</h2>
        <p className="text-muted-foreground mb-6">
          Start building your precious metals portfolio by adding your first
          item.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button onClick={onAddFromCatalog} className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add from Catalog
          </Button>
          <Button onClick={onAddCustom} variant="outline" className="w-full">
            <Plus className="h-4 w-4 mr-2" />
            Add Custom Item
          </Button>
        </div>

        {/* Popular Items */}
        {popularItems && popularItems.length > 0 && onQuickAdd && (
          <div className="mt-8 w-full">
            <p className="text-sm text-muted-foreground mb-3">
              Popular items to get started:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {popularItems.slice(0, 4).map((item) => (
                <Card
                  key={item.id}
                  className="cursor-pointer hover:border-primary transition-colors"
                  onClick={() => onQuickAdd(item.id)}
                >
                  <CardContent className="p-3 text-center">
                    <div className="text-2xl mb-1">
                      {item.metal === "gold"
                        ? "🥇"
                        : item.metal === "silver"
                          ? "🥈"
                          : "⚪"}
                    </div>
                    <div className="text-xs font-medium truncate">
                      {item.name}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Smaller empty state for specific sections
export function EmptyStateSmall({
  title,
  description,
  action,
  actionLabel,
  className,
}: {
  title: string;
  description?: string;
  action?: () => void;
  actionLabel?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-8 text-center",
        className,
      )}
    >
      <p className="text-sm font-medium text-muted-foreground">{title}</p>
      {description && (
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      )}
      {action && actionLabel && (
        <Button variant="link" size="sm" onClick={action} className="mt-2">
          {actionLabel}
          <ArrowRight className="h-3 w-3 ml-1" />
        </Button>
      )}
    </div>
  );
}
