"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/shadcn/dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Separator } from "@/components/ui/shadcn/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { MetalBadge, PriceDisplay } from "@/components/atomic/atoms/metals";
import {
  MetalItemWithValuation,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils/currency";
import { todayLocalISO } from "@/lib/utils/date";
import {
  saleProfitLoss,
  sumSaleProfitLoss,
} from "@/../services/finance/metalsLedger";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  Package,
} from "lucide-react";

interface SellItemEntry {
  item: MetalItemWithValuation;
  quantity: number;
  pricePerUnit: string;
}

interface BulkSellDialogProps {
  items: MetalItemWithValuation[];
  isOpen: boolean;
  onClose: () => void;
  currency?: MetalsCurrency;
  onSuccess?: () => void;
}

export function BulkSellDialog({
  items,
  isOpen,
  onClose,
  currency = "eur",
  onSuccess,
}: BulkSellDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saleCurrency, setSaleCurrency] = useState<string>(
    currency.toUpperCase(),
  );
  const [saleDate, setSaleDate] = useState(
    todayLocalISO(),
  );

  // Track each item's sell data
  const [sellEntries, setSellEntries] = useState<SellItemEntry[]>([]);

  const sellItems = useMutation(api.vault.sellItems);

  // Initialize sell entries when dialog opens
  useEffect(() => {
    if (isOpen && items.length > 0) {
      setSellEntries(
        items.map((item) => ({
          item,
          quantity: item.quantity, // Default to selling all
          pricePerUnit: item.currentSellPrice?.toFixed(2) || "",
        })),
      );
      setSaleCurrency(currency.toUpperCase());
      setSaleDate(todayLocalISO());
      setError(null);
    }
  }, [isOpen, items, currency]);

  // P/L of each sale against its item's average cost (EUR), as the ledger
  // will realize it; not comparable with a price in another currency
  const previews = useMemo(
    () =>
      sellEntries.map((entry) => {
        const sale = saleProfitLoss(
          entry.item.averageCost,
          entry.quantity,
          parseFloat(entry.pricePerUnit) || 0,
        );
        return saleCurrency === "EUR"
          ? sale
          : { ...sale, costBasis: null, profitLoss: null, profitLossPercent: null };
      }),
    [sellEntries, saleCurrency],
  );

  const totals = useMemo(() => {
    const sum = sumSaleProfitLoss(previews);
    return {
      totalSaleValue: sum.proceeds,
      profit: sum.profitLoss,
      profitPercent: sum.profitLossPercent,
      itemCount: sellEntries.reduce((n, e) => n + e.quantity, 0),
    };
  }, [previews, sellEntries]);

  // Update a specific entry
  const updateEntry = (index: number, updates: Partial<SellItemEntry>) => {
    setSellEntries((prev) =>
      prev.map((entry, i) => (i === index ? { ...entry, ...updates } : entry)),
    );
  };

  // Validate all entries
  const isValid = useMemo(() => {
    return sellEntries.every((entry) => {
      const price = parseFloat(entry.pricePerUnit);
      return (
        entry.quantity > 0 && entry.quantity <= entry.item.quantity && price > 0
      );
    });
  }, [sellEntries]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isValid) {
      setError("Please fill in valid quantities and prices for all items");
      return;
    }

    setIsSubmitting(true);
    try {
      // One mutation: every sale is recorded, or none is
      await sellItems({
        sales: sellEntries.map((entry) => ({
          vaultItemId: entry.item._id as Id<"vaultItems">,
          quantity: entry.quantity,
          pricePerUnit: parseFloat(entry.pricePerUnit),
          notes: `Bulk sale of ${entry.quantity} × ${entry.item.displayName}`,
        })),
        currency: saleCurrency,
        transactionDate: saleDate,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to record sales:", err);
      setError(
        err instanceof ConvexError
          ? String(err.data)
          : "Failed to record sales. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Sell {items.length} Item{items.length !== 1 ? "s" : ""}
          </DialogTitle>
          <DialogDescription>
            Enter the sale price for each item. All sales will be recorded with
            the same date and currency.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="saleDate">Sale Date</Label>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={todayLocalISO()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Currency</Label>
              <Select value={saleCurrency} onValueChange={setSaleCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="CHF">CHF (Fr.)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Items list */}
          <div className="flex-1 min-h-0 py-4 overflow-y-auto">
            <div className="space-y-4 pr-4">
              {sellEntries.map((entry, index) => {
                const saleValue = previews[index]?.proceeds ?? 0;
                const profit = previews[index]?.profitLoss ?? null;

                return (
                  <div
                    key={entry.item._id}
                    className="p-3 rounded-lg border bg-card space-y-3"
                  >
                    {/* Item header */}
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <MetalBadge metal={entry.item.metalType} size="sm" />
                        <div>
                          <div className="font-medium text-sm">
                            {entry.item.displayName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {entry.item.quantity} available • Sell price:{" "}
                            {Number.isFinite(entry.item.currentSellPrice)
                              ? formatCurrency(entry.item.currentSellPrice, saleCurrency)
                              : "—"}
                            /unit
                          </div>
                        </div>
                      </div>
                      {profit !== null && (
                        <div
                          className={cn(
                            "flex items-center gap-1 text-xs font-medium",
                            profit >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {profit >= 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {formatCurrency(profit, saleCurrency, { showSign: true })}
                        </div>
                      )}
                    </div>

                    {/* Inputs */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs">Quantity</Label>
                        <Input
                          type="number"
                          min={1}
                          max={entry.item.quantity}
                          value={entry.quantity}
                          onChange={(e) =>
                            updateEntry(index, {
                              quantity: Math.max(
                                1,
                                Math.min(
                                  entry.item.quantity,
                                  parseInt(e.target.value) || 1,
                                ),
                              ),
                            })
                          }
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Price per Unit</Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={entry.pricePerUnit}
                          onChange={(e) =>
                            updateEntry(index, { pricePerUnit: e.target.value })
                          }
                          className="h-8"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Total</Label>
                        <div className="h-8 flex items-center text-sm font-medium">
                          {formatCurrency(saleValue, saleCurrency)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="py-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Items to sell</span>
              <span className="font-medium">{totals.itemCount} units</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Sale Value</span>
              <span className="font-semibold">
                {formatCurrency(totals.totalSaleValue, saleCurrency)}
              </span>
            </div>
            {totals.profit !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Estimated Total Profit/Loss
                </span>
                <span
                  className={cn(
                    "font-semibold flex items-center gap-1",
                    totals.profit >= 0 ? "text-profit" : "text-loss",
                  )}
                >
                  {totals.profit >= 0 ? (
                    <TrendingUp className="h-3.5 w-3.5" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5" />
                  )}
                  {formatCurrency(totals.profit, saleCurrency, { showSign: true })}
                  {totals.profitPercent !== null && (
                    <span className="text-xs">
                      ({totals.profitPercent >= 0 ? "+" : ""}
                      {totals.profitPercent.toFixed(1)}%)
                    </span>
                  )}
                </span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-sm text-destructive pb-4">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !isValid}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Record {sellEntries.length} Sale
              {sellEntries.length !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
