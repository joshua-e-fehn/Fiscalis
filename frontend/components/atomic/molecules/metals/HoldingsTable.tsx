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
import {
  MetalItemWithValuation,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { SortField, SortDirection } from "./HoldingsToolbar";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";

interface HoldingsTableProps {
  items: MetalItemWithValuation[];
  currency?: MetalsCurrency;
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
  currency = "eur",
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
        className="-ml-3 h-8 data-[state=open]:bg-accent"
        onClick={() => onSort?.(field)}
      >
        {children}
        {isActive ? (
          sortDirection === "asc" ? (
            <ArrowUp className="ml-1 h-3 w-3" />
          ) : (
            <ArrowDown className="ml-1 h-3 w-3" />
          )
        ) : (
          <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />
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
              <TableHead className="w-[40%]">Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">P/L</TableHead>
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
                  <div className="h-5 w-20 bg-muted animate-pulse rounded ml-auto" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-24 bg-muted animate-pulse rounded ml-auto" />
                </TableCell>
                <TableCell>
                  <div className="h-5 w-20 bg-muted animate-pulse rounded ml-auto" />
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
              <TableHead className="w-[40%]">Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Weight</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead className="text-right">P/L</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell
                colSpan={selectionMode ? 6 : 5}
                className="h-24 text-center text-muted-foreground"
              >
                No items found
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
                />
              </TableHead>
            )}
            <TableHead className="w-[40%]">
              {onSort ? <SortButton field="name">Item</SortButton> : "Item"}
            </TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">
              {onSort ? (
                <SortButton field="weight">Weight</SortButton>
              ) : (
                "Weight"
              )}
            </TableHead>
            <TableHead className="text-right">
              {onSort ? <SortButton field="value">Value</SortButton> : "Value"}
            </TableHead>
            <TableHead className="text-right">
              {onSort ? <SortButton field="profitLoss">P/L</SortButton> : "P/L"}
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
                    <span>×{item.quantity}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <MetalBadge metal={item.metalType} size="sm" />
              </TableCell>
              <TableCell className="text-right">
                <WeightDisplay
                  grams={item.fineWeightGrams * item.quantity}
                  unit="oz"
                  size="sm"
                />
              </TableCell>
              <TableCell className="text-right">
                <PriceDisplay
                  value={item.marketValue ?? 0}
                  currency={currency}
                  size="md"
                />
              </TableCell>
              <TableCell className="text-right">
                {item.profitLoss !== null && item.profitLossPercent !== null ? (
                  <ChangeIndicator
                    value={item.profitLoss}
                    percentage={item.profitLossPercent}
                    size="sm"
                    showIcon={false}
                  />
                ) : (
                  <span className="text-muted-foreground text-sm">—</span>
                )}
              </TableCell>
              {!selectionMode && (
                <TableCell>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
