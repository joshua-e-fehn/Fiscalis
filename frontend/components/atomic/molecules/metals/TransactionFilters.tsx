"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Search, Download } from "lucide-react";

export type TransactionTypeFilter =
  | "all"
  | "buy"
  | "sell"
  | "gift_received"
  | "gift_given";
export type MetalTypeFilter =
  | "all"
  | "gold"
  | "silver"
  | "platinum"
  | "palladium";

const TRANSACTION_TYPES = [
  "buy",
  "sell",
  "gift_received",
  "gift_given",
] as const satisfies readonly Exclude<TransactionTypeFilter, "all">[];

const METAL_TYPES = [
  "gold",
  "silver",
  "platinum",
  "palladium",
] as const satisfies readonly Exclude<MetalTypeFilter, "all">[];

interface TransactionFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  typeFilter: TransactionTypeFilter;
  onTypeFilterChange: (type: TransactionTypeFilter) => void;
  metalFilter: MetalTypeFilter;
  onMetalFilterChange: (metal: MetalTypeFilter) => void;
  onExport?: () => void;
  className?: string;
}

export function TransactionFilters({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  metalFilter,
  onMetalFilterChange,
  onExport,
  className,
}: TransactionFiltersProps) {
  const t = useTranslations("metals");
  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t("transactions.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Type filter */}
      <Select
        value={typeFilter}
        onValueChange={(v) => onTypeFilterChange(v as TransactionTypeFilter)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t("transactions.allTypes")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("transactions.allTypes")}</SelectItem>
          {TRANSACTION_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {t(`transactions.type.${type}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Metal filter */}
      <Select
        value={metalFilter}
        onValueChange={(v) => onMetalFilterChange(v as MetalTypeFilter)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder={t("transactions.allMetals")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("transactions.allMetals")}</SelectItem>
          {METAL_TYPES.map((metal) => (
            <SelectItem key={metal} value={metal}>
              {t(`metal.${metal}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Export button */}
      {onExport && (
        <Button variant="outline" onClick={onExport} className="gap-2">
          <Download className="h-4 w-4" />
          {t("transactions.exportCsv")}
        </Button>
      )}
    </div>
  );
}
