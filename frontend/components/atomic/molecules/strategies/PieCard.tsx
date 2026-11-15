"use client";

/**
 * PieCard
 *
 * One pie on /strategies/pies: its value, the largest drift, and per slice
 * the target and actual weight, the drift in percentage points (status
 * from services/portfolio/pies.ts driftStatus) and the amount to buy or
 * sell to get back to target. Money arrives in the display currency
 * (hooks/convex/pies.ts usePies).
 */

import { useFormatter, useTranslations } from "next-intl";
import { Pencil, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import type { PieView } from "@/hooks/convex/pies";
import {
  isInvestmentCategory,
  subcategoryLabel,
  useCategoryLabels,
} from "@/lib/config/categoryUI";
import { formatCurrency } from "@/lib/utils/currency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { cn } from "@/lib/utils";
import {
  PIE_DRIFT_THRESHOLD,
  type DriftStatus,
} from "@/../services/portfolio/pies";

type PieSliceView = PieView["slices"][number];

const STATUS_CLASS: Record<DriftStatus, string> = {
  onTarget: "text-emerald-600 dark:text-emerald-400",
  over: "text-amber-600 dark:text-amber-400",
  under: "text-sky-600 dark:text-sky-400",
};

interface PieCardProps {
  pie: PieView;
  currency: InvestmentCurrency;
  onEdit: () => void;
  onDelete: () => void;
}

export function PieCard({ pie, currency, onEdit, onDelete }: PieCardProps) {
  const t = useTranslations("strategies.pies.card");
  const format = useFormatter();
  const labels = useCategoryLabels();

  const percent = (value: number) =>
    format.number(value / 100, { style: "percent", maximumFractionDigits: 1 });
  const points = (value: number) =>
    t("drift", {
      value: format.number(value, {
        maximumFractionDigits: 1,
        signDisplay: "exceptZero",
      }),
    });
  const money = (value: number) =>
    formatCurrency(value, currency, { fractionDigits: 0 });

  const sliceName = (slice: PieSliceView): string => {
    if (slice.label) return slice.label;
    const { target } = slice;
    if (target.kind === "holdings") {
      const names = slice.holdings.map((h) => h.name);
      return names.length > 0
        ? names.join(", ")
        : t("holdingsCount", { count: target.holdingKeys.length });
    }
    if (target.subcategory && isInvestmentCategory(target.category)) {
      const label = subcategoryLabel(target.category, target.subcategory);
      if (label) return labels.name(label);
    }
    return target.subcategory
      ? target.subcategory
      : t("allOf", { category: labels.categoryNameOf(target.category) });
  };

  const isEmpty = pie.totalValue <= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="min-w-0 space-y-1">
          <CardTitle className="truncate">{pie.name}</CardTitle>
          {pie.description && <CardDescription>{pie.description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-muted-foreground">{t("totalValue")}</div>
            <div className="text-lg font-semibold tabular-nums">{money(pie.totalValue)}</div>
          </div>
          {pie.maxDrift !== null && (
            <div>
              <div className="text-muted-foreground">{t("maxDrift")}</div>
              <div
                className={cn(
                  "text-lg font-semibold tabular-nums",
                  pie.maxDrift < PIE_DRIFT_THRESHOLD ? STATUS_CLASS.onTarget : STATUS_CLASS.over,
                )}
              >
                {points(pie.maxDrift)}
              </div>
            </div>
          )}
        </div>

        {isEmpty && <p className="text-sm text-muted-foreground">{t("noHoldings")}</p>}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.slice")}</TableHead>
              <TableHead className="text-right">{t("columns.target")}</TableHead>
              <TableHead className="text-right">{t("columns.actual")}</TableHead>
              <TableHead className="text-right">{t("columns.drift")}</TableHead>
              <TableHead className="text-right">{t("columns.rebalance")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pie.slices.map((slice, i) => (
              <TableRow key={i}>
                <TableCell className="max-w-64">
                  <div className="truncate font-medium">{sliceName(slice)}</div>
                  <AllocationBar
                    target={slice.targetWeight}
                    actual={slice.actualWeight ?? 0}
                  />
                  {slice.missingHoldingKeys.length > 0 && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {t("missingHoldings", { count: slice.missingHoldingKeys.length })}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {percent(slice.targetWeight)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {slice.actualWeight === null ? t("balanced") : percent(slice.actualWeight)}
                  <div className="text-xs text-muted-foreground">{money(slice.actualValue)}</div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {slice.drift === null || slice.status === null ? (
                    t("balanced")
                  ) : (
                    <div className="flex flex-col items-end gap-1">
                      <span className={STATUS_CLASS[slice.status]}>{points(slice.drift)}</span>
                      <Badge variant="outline" className="text-xs font-normal">
                        {t(`status.${slice.status}`)}
                      </Badge>
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {isEmpty || Math.round(slice.rebalance) === 0
                    ? t("balanced")
                    : slice.rebalance > 0
                      ? t("buy", { amount: money(slice.rebalance) })
                      : t("sell", { amount: money(-slice.rebalance) })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <p className="text-xs text-muted-foreground">
          {t("threshold", { threshold: PIE_DRIFT_THRESHOLD })}
        </p>
      </CardContent>
    </Card>
  );
}

/** The actual weight as a bar, with a tick at the target weight. */
function AllocationBar({ target, actual }: { target: number; actual: number }) {
  const clamp = (v: number) => Math.min(100, Math.max(0, v));
  return (
    <div className="relative mt-2 h-1.5 w-full rounded-full bg-muted" aria-hidden>
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-primary"
        style={{ width: `${clamp(actual)}%` }}
      />
      <div
        className="absolute -top-0.5 h-2.5 w-0.5 bg-foreground"
        style={{ left: `${clamp(target)}%` }}
      />
    </div>
  );
}
