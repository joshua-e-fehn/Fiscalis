"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Search,
  Star,
  X,
  Loader2,
  ExternalLink,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Database,
  Heart,
} from "lucide-react";
import { Input } from "@/components/ui/shadcn/input";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/shadcn/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/shadcn/tooltip";
import {
  useConvexIndicatorSearch,
  useWorldBankSyncStatus,
  useUserFavorites,
  useToggleFavorite,
} from "@/hooks/convex";
import type {
  IndicatorMetadata,
  IndicatorCategory,
} from "@/lib/types/worldbank";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface SelectedIndicator {
  id: string; // Either IndicatorId or World Bank code
  name: string;
  description?: string;
  isDynamic: boolean; // true = searched indicator, false = featured
  unit?: string;
  status?: "ok" | "warning" | "error"; // Reliability status from Convex
}

// Convex search result type
interface ConvexSearchedIndicator {
  code: string;
  name: string;
  description?: string;
  source: string;
  topics: string[];
  status: "ok" | "warning" | "error";
  timeoutCount: number;
}

interface IndicatorSearchProps {
  selectedIndicator: SelectedIndicator;
  onSelect: (indicator: SelectedIndicator) => void;
  featuredIndicators?: Record<IndicatorCategory, IndicatorMetadata[]>;
  userId?: string; // Clerk user ID for favorites
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export function IndicatorSearch({
  selectedIndicator,
  onSelect,
  featuredIndicators,
  userId,
}: IndicatorSearchProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Convex-based search (instant results from synced database)
  const {
    indicators: searchResults,
    isLoading: isSearching,
    totalInDb,
  } = useConvexIndicatorSearch(
    debouncedQuery,
    open && debouncedQuery.length >= 2,
  );

  // Get sync status for UI feedback
  const { indicatorCount, needsSync, lastSync } = useWorldBankSyncStatus();

  // User favorites
  const { favorites } = useUserFavorites(userId);
  const toggleFavorite = useToggleFavorite();

  // Check if indicator is favorited
  const isFavorited = useCallback(
    (code: string) => favorites.some((f) => f.code === code),
    [favorites],
  );

  // Handle toggle favorite
  const handleToggleFavorite = useCallback(
    async (
      e: React.MouseEvent,
      code: string,
      name: string,
      description?: string,
    ) => {
      e.stopPropagation();
      if (!userId) return;
      await toggleFavorite({
        userId,
        indicatorCode: code,
        indicatorName: name,
        indicatorDescription: description,
      });
    },
    [userId, toggleFavorite],
  );

  // Focus input when dialog opens
  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Handle selection
  const handleSelectFeatured = useCallback(
    (indicator: IndicatorMetadata) => {
      onSelect({
        id: indicator.id,
        name: indicator.name,
        description: indicator.description,
        isDynamic: false,
        unit: indicator.unit,
      });
      setOpen(false);
      setSearchQuery("");
    },
    [onSelect],
  );

  const handleSelectSearched = useCallback(
    (indicator: ConvexSearchedIndicator) => {
      onSelect({
        id: indicator.code,
        name: indicator.name,
        description: indicator.description,
        isDynamic: true,
        status: indicator.status,
      });
      setOpen(false);
      setSearchQuery("");
    },
    [onSelect],
  );

  // Handle selecting a favorite indicator
  const handleSelectFavorite = useCallback(
    (favorite: { code: string; name: string; description?: string }) => {
      onSelect({
        id: favorite.code,
        name: favorite.name,
        description: favorite.description,
        isDynamic: true, // Favorites are custom/searched indicators
      });
      setOpen(false);
      setSearchQuery("");
    },
    [onSelect],
  );

  const categoryLabels: Record<IndicatorCategory, string> = {
    economy: "Economy",
    demographics: "Demographics",
    finance: "Finance",
    trade: "Trade",
    energy: "Energy & Environment",
    development: "Development",
    commodities: "Commodities",
  };

  // Format last sync date
  const formatLastSync = (timestamp?: number) => {
    if (!timestamp) return "Never";
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-[320px] justify-between">
          <div className="flex items-center gap-2 truncate">
            {selectedIndicator.isDynamic ? (
              <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            ) : (
              <Star className="h-4 w-4 text-yellow-500 flex-shrink-0" />
            )}
            <span className="truncate">{selectedIndicator.name}</span>
          </div>
          <Badge variant="secondary" className="ml-2 flex-shrink-0">
            {selectedIndicator.isDynamic ? "Custom" : "Featured"}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Select Indicator</DialogTitle>
          <DialogDescription>
            Choose from featured indicators or search{" "}
            {indicatorCount > 0 ? indicatorCount.toLocaleString() : "all"} World
            Bank indicators
          </DialogDescription>
        </DialogHeader>

        {/* Sync Status Banner */}
        {needsSync && (
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-md text-sm">
            <Database className="h-4 w-4 text-amber-500" />
            <span className="text-amber-600 dark:text-amber-400">
              Indicator database needs to be synced. Run sync to enable full
              search.
            </span>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search all World Bank indicators..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
              onClick={() => setSearchQuery("")}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Results Area */}
        <div className="flex-1 overflow-y-auto min-h-[300px] max-h-[400px] border rounded-md">
          {/* Search Results */}
          {searchQuery.length >= 2 ? (
            <div className="p-2">
              {isSearching ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Searching...
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-1">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground sticky top-0 bg-background flex justify-between items-center">
                    <span>Search Results ({searchResults.length})</span>
                    {totalInDb > 0 && (
                      <span className="text-xs text-muted-foreground/60">
                        from {totalInDb.toLocaleString()} indicators
                      </span>
                    )}
                  </div>
                  {searchResults.map((indicator: ConvexSearchedIndicator) => (
                    <div
                      key={indicator.code}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectSearched(indicator)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSelectSearched(indicator)
                      }
                      className="w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors group cursor-pointer"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">
                              {indicator.name}
                            </span>
                            {/* Status badges */}
                            {indicator.status === "warning" && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="flex-shrink-0 gap-1 text-amber-600 border-amber-500/50 bg-amber-500/10 py-0 px-1.5"
                                    >
                                      <AlertTriangle className="h-3 w-3" />
                                      <span className="text-xs">Slow</span>
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      This indicator has experienced timeouts (
                                      {indicator.timeoutCount}x).
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      May be slow or unreliable.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                            {indicator.status === "error" && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge
                                      variant="outline"
                                      className="flex-shrink-0 gap-1 text-red-600 border-red-500/50 bg-red-500/10 py-0 px-1.5"
                                    >
                                      <AlertCircle className="h-3 w-3" />
                                      <span className="text-xs">
                                        Unreliable
                                      </span>
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      This indicator frequently fails to load (
                                      {indicator.timeoutCount}x timeouts).
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      Data may not be available.
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {indicator.code}
                          </div>
                          {indicator.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-1">
                              {indicator.description}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 mt-1">
                          {/* Favorite button */}
                          {userId && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) =>
                                      handleToggleFavorite(
                                        e,
                                        indicator.code,
                                        indicator.name,
                                        indicator.description,
                                      )
                                    }
                                  >
                                    <Heart
                                      className={`h-4 w-4 ${
                                        isFavorited(indicator.code)
                                          ? "text-red-500 fill-red-500"
                                          : "text-muted-foreground hover:text-red-500"
                                      }`}
                                    />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {isFavorited(indicator.code)
                                    ? "Remove from favorites"
                                    : "Add to favorites"}
                                </TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : needsSync ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Database className="h-8 w-8 mb-2 opacity-50" />
                  <p>Indicator database is empty</p>
                  <p className="text-xs mt-1">
                    Run the sync to populate indicators
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <p>No indicators found for "{searchQuery}"</p>
                  <p className="text-xs mt-1">Try different keywords</p>
                </div>
              )}
            </div>
          ) : (
            /* Featured Indicators and Favorites */
            <div className="p-2">
              {/* User Favorites Section */}
              {userId && favorites.length > 0 && (
                <div className="mb-4">
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1 sticky top-0 bg-background">
                    <Heart className="h-3 w-3 text-red-500 fill-red-500" />
                    Your Favorites
                  </div>
                  {favorites.map((favorite) => (
                    <div
                      key={favorite.code}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectFavorite(favorite)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && handleSelectFavorite(favorite)
                      }
                      className={`w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors group cursor-pointer ${
                        selectedIndicator.id === favorite.code
                          ? "bg-accent"
                          : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {favorite.name}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {favorite.code}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {selectedIndicator.id === favorite.code && (
                            <Badge variant="secondary">Selected</Badge>
                          )}
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 opacity-60 hover:opacity-100"
                                  onClick={(e) =>
                                    handleToggleFavorite(
                                      e,
                                      favorite.code,
                                      favorite.name,
                                      favorite.description,
                                    )
                                  }
                                >
                                  <Heart className="h-4 w-4 text-red-500 fill-red-500" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                Remove from favorites
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Featured Indicators */}
              <div className="px-2 py-1 text-xs font-medium text-muted-foreground flex items-center gap-1 sticky top-0 bg-background">
                <Star className="h-3 w-3 text-yellow-500" />
                Featured Indicators
              </div>
              {featuredIndicators &&
                Object.entries(featuredIndicators).map(
                  ([category, indicators]) => (
                    <div key={category} className="mb-3">
                      <div className="px-2 py-1 text-xs font-semibold text-foreground/70">
                        {categoryLabels[category as IndicatorCategory]}
                      </div>
                      {indicators.map((indicator) => (
                        <button
                          key={indicator.id}
                          onClick={() => handleSelectFeatured(indicator)}
                          className={`w-full text-left px-3 py-2 rounded-md hover:bg-accent transition-colors ${
                            selectedIndicator.id === indicator.id &&
                            !selectedIndicator.isDynamic
                              ? "bg-accent"
                              : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="font-medium">
                                {indicator.name}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {indicator.description}
                              </div>
                            </div>
                            {selectedIndicator.id === indicator.id &&
                              !selectedIndicator.isDynamic && (
                                <Badge variant="secondary" className="ml-2">
                                  Selected
                                </Badge>
                              )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ),
                )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-xs text-muted-foreground text-center pt-2 border-t flex justify-between items-center">
          <span>
            Data source:{" "}
            <a
              href="https://data.worldbank.org/indicator"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:underline"
            >
              World Bank Open Data
            </a>
          </span>
          {lastSync && (
            <span className="flex items-center gap-1 text-muted-foreground/60">
              <RefreshCw className="h-3 w-3" />
              Synced: {formatLastSync(lastSync)}
            </span>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
