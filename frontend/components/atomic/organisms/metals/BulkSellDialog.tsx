"use client";

import { useState, useEffect, useMemo } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { useTranslations } from "next-intl";
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
import { MetalBadge } from "@/components/atomic/atoms/metals";
import { CurrencySelect } from "@/components/atomic/atoms/currencySelect";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { MetalItemWithValuation } from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";
import { todayLocalISO } from "@/lib/utils/date";
import { useErrorMessage } from "@/i18n/errors";
import {
  ledgerUnitsPerEur,
  saleProfitLossIn,
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
  /** The currency of the items' valuation (currentSellPrice); defaults to the display currency */
  currency?: InvestmentCurrency;
  onSuccess?: () => void;
}

export function BulkSellDialog({
  items,
  isOpen,
  onClose,
  currency: valuationCurrency,
  onSuccess,
}: BulkSellDialogProps) {
  const t = useTranslations("metals.bulkSell");
  const tActions = useTranslations("common.actions");
  const toErrorMessage = useErrorMessage();
  const display = useDisplayCurrency();
  const currency = valuationCurrency ?? display.currency;
  const displayCode = display.code;
  const displayUnitsPerEur = display.unitsPerEur;
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

  // P/L of each sale against its item's average cost, as the ledger will
  // realize it: the EUR cost in the sale currency (EUR or the display
  // currency); unknown in any other
  const previews = useMemo(() => {
    const unitsPerEur = ledgerUnitsPerEur(null, {
      code: displayCode,
      unitsPerEur: displayUnitsPerEur,
    });
    return sellEntries.map((entry) =>
      saleProfitLossIn(
        entry.item.averageCost,
        entry.quantity,
        parseFloat(entry.pricePerUnit) || 0,
        saleCurrency,
        unitsPerEur,
      ),
    );
  }, [sellEntries, saleCurrency, displayCode, displayUnitsPerEur]);

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
      setError(t("errors.invalid"));
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
          // Stored with the sale, written in the user's language
          notes: t("saleNote", {
            quantity: entry.quantity,
            name: entry.item.displayName,
          }),
        })),
        currency: saleCurrency,
        transactionDate: saleDate,
      });
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error("Failed to record sales:", err);
      setError(
        err instanceof ConvexError ? toErrorMessage(err) : t("errors.failed"),
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
            {t("title", { count: items.length })}
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* Common fields */}
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="saleDate">{t("saleDate")}</Label>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={todayLocalISO()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">{t("currency")}</Label>
              <CurrencySelect
                id="currency"
                value={saleCurrency}
                onValueChange={setSaleCurrency}
              />
            </div>
          </div>

          <Separator />

          {/* Items list */}
          <div className="flex-1 min-h-0 py-4 overflow-y-auto">
            <div className="space-y-4 pe-4">
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
                            {t("itemLine", {
                              count: entry.item.quantity,
                              price: Number.isFinite(entry.item.currentSellPrice)
                                ? formatCurrency(
                                    entry.item.currentSellPrice,
                                    currency,
                                  )
                                : "—",
                            })}
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
                        <Label className="text-xs">{t("quantity")}</Label>
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
                        <Label className="text-xs">{t("pricePerUnit")}</Label>
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
                        <Label className="text-xs">{t("total")}</Label>
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
              <span className="text-muted-foreground">{t("itemsToSell")}</span>
              <span className="font-medium">
                {t("units", { count: totals.itemCount })}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("totalSaleValue")}
              </span>
              <span className="font-semibold">
                {formatCurrency(totals.totalSaleValue, saleCurrency)}
              </span>
            </div>
            {totals.profit !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("estimatedTotalProfitLoss")}
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
                      ({formatPercent(totals.profitPercent, true, 1, 1)})
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
              {tActions("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting || !isValid}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              )}
              {t("submit", { count: sellEntries.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
