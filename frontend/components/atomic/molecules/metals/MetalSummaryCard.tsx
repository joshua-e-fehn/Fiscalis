"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  MetalIcon,
  PriceDisplay,
  WeightDisplay,
  PercentageChange,
  SummaryCardSkeleton,
} from "@/components/atomic/atoms/metals";
import {
  MetalsType,
  MetalSummary,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface MetalSummaryCardProps {
  metal: MetalsType;
  summary: MetalSummary;
  currency?: MetalsCurrency;
  isLoading?: boolean;
  className?: string;
  onClick?: () => void;
}

const metalConfig: Record<
  MetalsType,
  {
    label: string;
    borderClass: string;
    bgClass: string;
    hoverShadow: string;
  }
> = {
  gold: {
    label: "Gold",
    borderClass: "border-l-metal-gold",
    bgClass: "hover:bg-metal-gold/5",
    hoverShadow: "hover:shadow-metal-gold",
  },
  silver: {
    label: "Silver",
    borderClass: "border-l-metal-silver",
    bgClass: "hover:bg-metal-silver/5",
    hoverShadow: "hover:shadow-metal-silver",
  },
  platinum: {
    label: "Platinum",
    borderClass: "border-l-metal-platinum",
    bgClass: "hover:bg-metal-platinum/5",
    hoverShadow: "hover:shadow-metal-platinum",
  },
  palladium: {
    label: "Palladium",
    borderClass: "border-l-metal-palladium",
    bgClass: "hover:bg-metal-palladium/5",
    hoverShadow: "hover:shadow-metal-palladium",
  },
};

export function MetalSummaryCard({
  metal,
  summary,
  currency = "eur",
  isLoading = false,
  className,
  onClick,
}: MetalSummaryCardProps) {
  const config = metalConfig[metal];
  const hasHoldings = summary.itemCount > 0;

  if (isLoading) {
    return <SummaryCardSkeleton metal={metal} className={className} />;
  }

  return (
    <motion.div
      whileHover={{ scale: 1.02, y: -4 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
      <Card
        className={cn(
          "border-l-4 transition-all duration-200 cursor-pointer",
          config.borderClass,
          config.bgClass,
          config.hoverShadow,
          className,
        )}
        onClick={onClick}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <MetalIcon metal={metal} />
            {config.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasHoldings ? (
            <>
              <PriceDisplay
                value={summary.marketValue}
                currency={currency}
                size="lg"
              />
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <WeightDisplay
                  grams={summary.totalFineWeightGrams}
                  unit="oz"
                  size="sm"
                />
                <span>·</span>
                <span>
                  {summary.totalItems}{" "}
                  {summary.totalItems === 1 ? "item" : "items"}
                </span>
              </div>
              {summary.profitLossPercent !== null && (
                <div className="mt-1">
                  <PercentageChange
                    value={summary.profitLossPercent}
                    size="sm"
                  />
                  <span className="text-xs text-muted-foreground ml-1">
                    P/L
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="text-muted-foreground text-sm">No holdings</div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
