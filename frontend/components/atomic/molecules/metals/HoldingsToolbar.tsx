"use client";

import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { cn } from "@/lib/utils";
import { MetalsType } from "@/lib/types/metals-extended";
import {
  Search,
  Filter,
  Grid3X3,
  List,
  Layers,
  ArrowUpDown,
  Download,
  Plus,
  BadgeDollarSign,
  X,
} from "lucide-react";

export type ViewMode = "table" | "cards" | "grouped";
export type SortField =
  | "name"
  | "value"
  | "weight"
  | "profitLoss"
  | "dateAdded";
export type SortDirection = "asc" | "desc";

interface HoldingsToolbarProps {
  // Search
  searchQuery: string;
  onSearchChange: (query: string) => void;

  // View mode
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;

  // Sorting
  sortField: SortField;
  sortDirection: SortDirection;
  onSortChange: (field: SortField) => void;

  // Filters
  metalFilter: MetalsType | "all";
  onMetalFilterChange: (metal: MetalsType | "all") => void;

  // Selection mode
  selectionMode?: boolean;
  selectedCount?: number;
  onToggleSelectionMode?: () => void;
  onSellSelected?: () => void;

  // Actions
  onAddItem: () => void;
  onExport?: () => void;

  className?: string;
}

export function HoldingsToolbar({
  searchQuery,
  onSearchChange,
  viewMode,
  onViewModeChange,
  sortField,
  sortDirection,
  onSortChange,
  metalFilter,
  onMetalFilterChange,
  selectionMode = false,
  selectedCount = 0,
  onToggleSelectionMode,
  onSellSelected,
  onAddItem,
  onExport,
  className,
}: HoldingsToolbarProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 md:flex-row md:items-center md:justify-between",
        className,
      )}
    >
      {/* Left side: Search & Filters (or selection info) */}
      {selectionMode ? (
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleSelectionMode}
            title="Cancel selection"
          >
            <X className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">
            {selectedCount} item{selectedCount !== 1 ? "s" : ""} selected
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {/* Search */}
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="pl-8"
            />
          </div>

          {/* Metal Filter */}
          <Select
            value={metalFilter}
            onValueChange={(v) => onMetalFilterChange(v as MetalsType | "all")}
          >
            <SelectTrigger className="w-full sm:w-36">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All metals" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Metals</SelectItem>
              <SelectItem value="gold">🥇 Gold</SelectItem>
              <SelectItem value="silver">🥈 Silver</SelectItem>
              <SelectItem value="platinum">⚪ Platinum</SelectItem>
              <SelectItem value="palladium">⬜ Palladium</SelectItem>
            </SelectContent>
          </Select>

          {/* Sort */}
          <Select
            value={sortField}
            onValueChange={(v) => onSortChange(v as SortField)}
          >
            <SelectTrigger className="w-full sm:w-40">
              <ArrowUpDown className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="value">Value</SelectItem>
              <SelectItem value="weight">Weight</SelectItem>
              <SelectItem value="profitLoss">Profit/Loss</SelectItem>
              <SelectItem value="dateAdded">Date Added</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Right side: View mode & Actions */}
      <div className="flex items-center gap-2">
        {selectionMode ? (
          /* Selection mode actions */
          <Button onClick={onSellSelected} disabled={selectedCount === 0}>
            <BadgeDollarSign className="h-4 w-4 mr-2" />
            Sell Selected
          </Button>
        ) : (
          <>
            {/* View Mode Toggle */}
            <div className="flex items-center border rounded-md">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => onViewModeChange("table")}
                title="Table view"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "cards" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-none border-x"
                onClick={() => onViewModeChange("cards")}
                title="Card view"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "grouped" ? "secondary" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => onViewModeChange("grouped")}
                title="Grouped view"
              >
                <Layers className="h-4 w-4" />
              </Button>
            </div>

            {/* Export */}
            {onExport && (
              <Button
                variant="outline"
                size="icon"
                onClick={onExport}
                title="Export CSV"
              >
                <Download className="h-4 w-4" />
              </Button>
            )}

            {/* Sell Items */}
            {onToggleSelectionMode && (
              <Button onClick={onToggleSelectionMode}>
                <BadgeDollarSign className="h-4 w-4 mr-2" />
                Sell Items
              </Button>
            )}

            {/* Add Item */}
            <Button onClick={onAddItem}>
              <Plus className="h-4 w-4 mr-2" />
              Add Item
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
