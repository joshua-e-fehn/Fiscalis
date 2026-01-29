"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  AnimatedNumber,
  ChangeIndicator,
  ValueCardSkeleton,
} from "@/components/atomic/atoms/metals";
import { MetalsCurrency } from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import { motion } from "framer-motion";

interface TotalValueCardProps {
  totalValue: number;
  dailyChange?: number;
  dailyChangePercent?: number;
  currency?: MetalsCurrency;
  isLoading?: boolean;
  className?: string;
}

function formatCurrency(value: number, currency: MetalsCurrency): string {
  const currencyMap: Record<MetalsCurrency, string> = {
    eur: "EUR",
    usd: "USD",
    chf: "CHF",
  };
  return new Intl.NumberFormat("de-CH", {
    style: "currency",
    currency: currencyMap[currency],
    minimumFractionDigits: 2,
  }).format(value);
}

export function TotalValueCard({
  totalValue,
  dailyChange,
  dailyChangePercent,
  currency = "eur",
  isLoading = false,
  className,
}: TotalValueCardProps) {
  if (isLoading) {
    return <ValueCardSkeleton className={className} />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="h-full"
    >
      <Card className={cn("h-full", className)}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Total Portfolio Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <AnimatedNumber
            value={totalValue}
            formatFn={(v) => formatCurrency(v, currency)}
            className="text-3xl font-bold"
            duration={600}
          />
          {dailyChange !== undefined && dailyChangePercent !== undefined && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="mt-1"
            >
              <ChangeIndicator
                value={dailyChange}
                percentage={dailyChangePercent}
                currency={currency}
                size="sm"
              />
              <span className="text-xs text-muted-foreground ml-1">today</span>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
