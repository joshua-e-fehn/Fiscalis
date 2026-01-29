"use client";

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
import { Search, Download, Calendar } from "lucide-react";

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
  return (
    <div className={cn("flex items-center gap-3 flex-wrap", className)}>
      {/* Search */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search transactions..."
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
          <SelectValue placeholder="All Types" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Types</SelectItem>
          <SelectItem value="buy">Buy</SelectItem>
          <SelectItem value="sell">Sell</SelectItem>
          <SelectItem value="gift_received">Gift Received</SelectItem>
          <SelectItem value="gift_given">Gift Given</SelectItem>
        </SelectContent>
      </Select>

      {/* Metal filter */}
      <Select
        value={metalFilter}
        onValueChange={(v) => onMetalFilterChange(v as MetalTypeFilter)}
      >
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="All Metals" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Metals</SelectItem>
          <SelectItem value="gold">Gold</SelectItem>
          <SelectItem value="silver">Silver</SelectItem>
          <SelectItem value="platinum">Platinum</SelectItem>
          <SelectItem value="palladium">Palladium</SelectItem>
        </SelectContent>
      </Select>

      {/* Export button */}
      {onExport && (
        <Button variant="outline" onClick={onExport} className="gap-2">
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      )}
    </div>
  );
}
