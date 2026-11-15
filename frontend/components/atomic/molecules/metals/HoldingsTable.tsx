"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import {
  MetalBadge,
  PriceDisplay,
  WeightDisplay,
  ChangeIndicator,
  PurityBadge,
  CategoryBadge,
} from "@/components/atomic/atoms/metals";
import { MetalItemWithValuation } from "@/lib/types/metals-extended";
import type { MetalsDisplayCurrency } from "@/lib/types/metals";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { SortField, SortDirection } from "./HoldingsToolbar";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";

interface HoldingsTableProps {
  items: MetalItemWithValuation[];
  currency: MetalsDisplayCurrency;
  sortField?: SortField;
  sortDirection?: SortDirection;
  onSort?: (field: SortField) => void;
  onItemClick?: (item: MetalItemWithValuation) => void;
  isLoading?: boolean;
  // Selection
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  className?: string;
}

export function HoldingsTable({
  items,
  currency,
  sortField,
  sortDirection,
  onSort,
  onItemClick,
  isLoading = false,
  selectionMode = false,
  selectedIds = new Set(),
  onSelectionChange,
  className,
}: HoldingsTableProps) {
  const t = useTranslations("metals.holdings");
  const SortButton = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => {
    const isActive = sortField === field;
    return (
      <Button
        variant="ghost"
        size="sm"
        className="-ms-3 h-8 data-[state=open]:bg-accent"
        onClick={() => onSort?.(field)}
      >
        {children}
        {isActive ? (
          sortDirection === "asc" ? (
            <ArrowUp className="ms-1 h-3 w-3" />
          ) : (
            <ArrowDown className="ms-1 h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="ms-1 h-3 w-3 opacity-50" />
        )}
      </Button>
    );
  };

  const toggleSelection = (itemId: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    onSelectionChange?.(newSelected);
  };

  const toggleAll = () => {
    if (selectedIds.size === items.length) {
      onSelectionChange?.(new Set());
    } else {
      onSelectionChange?.(new Set(items.map((item) => item._id)));
    }
  };

  const allSelected = items.length > 0 && selectedIds.size === items.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < items.length;

  if (isLoading) {
    return (
      <div className={cn("rounded-md border", className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {selectionMode && <TableHead className="w-10"></TableHead>}
              <TableHead className="w-[40%]">{t("columns.item")}</TableHead>
              <TableHead>{t("columns.metal")}</TableHead>
              <TableHead className="text-end">
                {t("columns.weight")}
              </TableHead>
              <TableHead className="text-end">{t("columns.value")}</TableHead>
              <TableHead className="text-end">
                {t("columns.profitLoss")}
              </TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {selectionMode && <TableCell></TableCell>}
                <TableCell>
                  <div className="h-5 w-48 bg-muted animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-16 bg-muted animate-pulse rounded" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-20 bg-muted animate-pulse rounded ms-auto" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-24 bg-muted animate-pulse rounded ms-auto" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-20 bg-muted animate-pulse rounded ms-auto" />
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className={cn("rounded-md border", className)}>
        <Table>
          <TableHeader>
            <TableRow>
              {selectionMode && <TableHead className="w-10"></TableHead>}
              <TableHead className="w-[40%]">{t("columns.item")}</TableHead>
              <TableHead>{t("columns.metal")}</TableHead>
              <TableHead className="text-end">
                {t("columns.weight")}
              </TableHead>
              <TableHead className="text-end">{t("columns.value")}</TableHead>
              <TableHead className="text-end">
                {t("columns.profitLoss")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={selectionMode ? 6 : 5}
                className="h-24 text-center text-muted-foreground"
              >
                {t("noItems")}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    );
  }

  return (
    <div className={cn("rounded-md border", className)}>
      <Table>
        <TableHeader>
          <TableRow>
            {selectionMode && (
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  ref={(el) => {
                    if (el) {
                      (el as HTMLButtonElement).dataset.state = someSelected
                        ? "indeterminate"
                        : allSelected
                          ? "checked"
                          : "unchecked";
                    }
                  }}
                  onCheckedChange={toggleAll}
                  aria-label={t("selectAll")}
                />
              </TableHead>
            )}
            <TableHead className="w-[40%]">
              {onSort ? (
                <SortButton field="name">{t("columns.item")}</SortButton>
              ) : (
                t("columns.item")
              )}
            </TableHead>
            <TableHead>{t("columns.metal")}</TableHead>
            <TableHead className="text-end">
              {onSort ? (
                <SortButton field="weight">{t("columns.weight")}</SortButton>
              ) : (
                t("columns.weight")
              )}
            </TableHead>
            <TableHead className="text-end">
              {onSort ? (
                <SortButton field="value">{t("columns.value")}</SortButton>
              ) : (
                t("columns.value")
              )}
            </TableHead>
            <TableHead className="text-end">
              {onSort ? (
                <SortButton field="profitLoss">
                  {t("columns.profitLoss")}
                </SortButton>
              ) : (
                t("columns.profitLoss")
              )}
            </TableHead>
            {!selectionMode && <TableHead className="w-8"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item._id}
              className={cn(
                "cursor-pointer hover:bg-muted/50",
                selectionMode && selectedIds.has(item._id) && "bg-muted/30",
              )}
              onClick={() => {
                if (selectionMode) {
                  toggleSelection(item._id);
                } else {
                  onItemClick?.(item);
                }
              }}
            >
              {selectionMode && (
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedIds.has(item._id)}
                    onCheckedChange={() => toggleSelection(item._id)}
                    aria-label={t("selectItem", { name: item.displayName })}
                  />
                </TableCell>
              )}
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">{item.displayName}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <CategoryBadge category={item.category} />
                    {item.purity && (
                      <PurityBadge purity={item.purity} size="sm" />
                    )}
                    <span>{t("quantity", { count: item.quantity })}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <MetalBadge metal={item.metalType} size="sm" />
              </TableCell>
              <TableCell className="text-end">
                <WeightDisplay
                  grams={item.fineWeightGrams * item.quantity}
                  unit="oz"
                  size="sm"
                />
              </TableCell>
              <TableCell className="text-end">
                {/* No fresh spot and no cost: the value is unknown */}
                {item.marketValue === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <PriceDisplay
                    value={item.marketValue}
                    currency={currency}
                    size="md"
                  />
                )}
              </TableCell>
              <TableCell className="text-end">
                {item.profitLoss !== null && item.profitLossPercent !== null ? (
                  <ChangeIndicator
                    value={item.profitLoss}
                    percentage={item.profitLossPercent}
                    currency={currency}
                    size="sm"
                    showIcon={false}
                  />
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              {!selectionMode && (
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground rtl:-scale-x-100" />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
