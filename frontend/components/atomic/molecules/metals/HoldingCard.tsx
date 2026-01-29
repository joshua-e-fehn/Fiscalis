"use client";

import { Card, CardContent } from "@/components/ui/shadcn/card";
import {
  MetalBadge,
  PriceDisplay,
  WeightDisplay,
  ChangeIndicator,
  PurityBadge,
  CategoryBadge,
} from "@/components/atomic/atoms/metals";
import {
  MetalItemWithValuation,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { MoreVertical, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { motion } from "framer-motion";

interface HoldingCardProps {
  item: MetalItemWithValuation;
  currency?: MetalsCurrency;
  onClick?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  className?: string;
}

// Metal-specific styling maps
const metalStyles = {
  gold: {
    border: "border-l-metal-gold",
    hoverShadow: "hover:shadow-metal-gold",
    glowBg: "bg-metal-gold-glow/5",
  },
  silver: {
    border: "border-l-metal-silver",
    hoverShadow: "hover:shadow-metal-silver",
    glowBg: "bg-metal-silver-glow/5",
  },
  platinum: {
    border: "border-l-metal-platinum",
    hoverShadow: "hover:shadow-metal-platinum",
    glowBg: "bg-metal-platinum-glow/5",
  },
  palladium: {
    border: "border-l-metal-palladium",
    hoverShadow: "hover:shadow-metal-palladium",
    glowBg: "bg-metal-palladium-glow/5",
  },
};

export function HoldingCard({
  item,
  currency = "eur",
  onClick,
  onEdit,
  onDelete,
  className,
}: HoldingCardProps) {
  const style = metalStyles[item.metalType];

  return (
    <motion.div
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card
        className={cn(
          "group relative border-l-4 transition-all duration-200 cursor-pointer",
          style.border,
          style.hoverShadow,
          "hover:border-l-[6px]",
          className,
        )}
        onClick={onClick}
      >
        <CardContent className="p-4">
          {/* Header Row */}
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-medium truncate pr-2">{item.displayName}</h3>
              {item.catalogItem?.mint && (
                <p className="text-sm text-muted-foreground truncate">
                  {item.catalogItem.mint}
                </p>
              )}
            </div>
            <div className="flex items-center gap-1">
              <MetalBadge metal={item.metalType} size="sm" />
              {(onEdit || onDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    asChild
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {onEdit && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onEdit();
                        }}
                      >
                        Edit
                      </DropdownMenuItem>
                    )}
                    {onDelete && (
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete();
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>

          {/* Details */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <CategoryBadge category={item.category} />
            {item.purity && <PurityBadge purity={item.purity} size="sm" />}
            <span>×{item.quantity}</span>
          </div>

          {/* Weight & Value */}
          <div className="flex items-end justify-between">
            <div className="space-y-0.5">
              <WeightDisplay
                grams={item.fineWeightGrams * item.quantity}
                unit="oz"
                size="sm"
              />
              <div className="text-xs text-muted-foreground">Fine Weight</div>
            </div>
            <div className="text-right">
              <PriceDisplay
                value={item.marketValue ?? 0}
                currency={currency}
                size="lg"
              />
              {item.profitLoss !== null && item.profitLossPercent !== null && (
                <ChangeIndicator
                  value={item.profitLoss}
                  percentage={item.profitLossPercent}
                  size="sm"
                  showIcon={false}
                />
              )}
            </div>
          </div>

          {/* Hover Arrow */}
          <ChevronRight className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </CardContent>
      </Card>
    </motion.div>
  );
}

// Compact version for dense layouts
export function HoldingCardCompact({
  item,
  currency = "eur",
  onClick,
  className,
}: Omit<HoldingCardProps, "onEdit" | "onDelete">) {
  const style = metalStyles[item.metalType];

  return (
    <motion.div
      whileHover={{ x: 4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors",
        style.glowBg,
        "hover:bg-muted/50",
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-3 min-w-0">
        <MetalBadge metal={item.metalType} size="sm" />
        <div className="min-w-0">
          <div className="font-medium truncate">{item.displayName}</div>
          <div className="text-xs text-muted-foreground">
            {item.quantity}× ·{" "}
            <WeightDisplay
              grams={item.fineWeightGrams * item.quantity}
              unit="oz"
              size="sm"
            />
          </div>
        </div>
      </div>
      <div className="text-right">
        <PriceDisplay
          value={item.marketValue ?? 0}
          currency={currency}
          size="md"
        />
      </div>
    </motion.div>
  );
}
