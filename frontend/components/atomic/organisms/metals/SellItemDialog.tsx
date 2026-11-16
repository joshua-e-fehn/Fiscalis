"use client";

import { useState, useEffect } from "react";
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
import { Textarea } from "@/components/ui/shadcn/textarea";
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
} from "@/../services/finance/metalsLedger";
import { convertBetween } from "@/../services/finance/currency";
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface SellItemDialogProps {
  item: MetalItemWithValuation | null;
  isOpen: boolean;
  onClose: () => void;
  /** The currency of the item's valuation (currentSellPrice); defaults to the display currency */
  currency?: InvestmentCurrency;
}

export function SellItemDialog({
  item,
  isOpen,
  onClose,
  currency: valuationCurrency,
}: SellItemDialogProps) {
  const t = useTranslations("metals.sell");
  const tActions = useTranslations("common.actions");
  const toErrorMessage = useErrorMessage();
  const display = useDisplayCurrency();
  const currency = valuationCurrency ?? display.currency;
  // EUR and the display currency's latest rate: the item's EUR average
  // cost converts into either
  const unitsPerEur = ledgerUnitsPerEur(null, display);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [quantity, setQuantity] = useState(1);
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [saleCurrency, setSaleCurrency] = useState<string>(
    currency.toUpperCase(),
  );
  const [saleDate, setSaleDate] = useState(
    todayLocalISO(),
  );
  const [notes, setNotes] = useState("");

  const addTransaction = useMutation(api.vault.addTransaction);

  // Reset form when dialog opens with a new item
  useEffect(() => {
    if (item && isOpen) {
      setQuantity(1);
      // Pre-fill with current sell price (what you'd receive selling today)
      setPricePerUnit(item.currentSellPrice?.toFixed(2) || "");
      setSaleCurrency(currency.toUpperCase());
      setSaleDate(todayLocalISO());
      setNotes("");
      setError(null);
    }
  }, [item, isOpen, currency]);

  if (!item) return null;

  const maxQuantity = item.quantity;
  const parsedPrice = parseFloat(pricePerUnit) || 0;
  const totalSaleValue = parsedPrice * quantity;

  // P/L of this sale against the item's average cost, as the ledger will
  // realize it: the EUR cost in the sale currency (EUR or the display
  // currency); unknown in any other
  const preview = saleProfitLossIn(
    item.averageCost,
    quantity,
    parsedPrice,
    saleCurrency,
    unitsPerEur,
  );
  const saleProfit = preview.profitLoss;
  const saleProfitPercent = preview.profitLossPercent;
  // The average cost in the valuation's currency; in EUR, as stored, when
  // that currency has no rate here
  const averageCostConverted =
    item.averageCost === null
      ? null
      : convertBetween(item.averageCost, "EUR", currency, unitsPerEur);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (quantity <= 0 || quantity > maxQuantity) {
      setError(t("errors.quantityRange", { max: maxQuantity }));
      return;
    }

    if (parsedPrice <= 0) {
      setError(t("errors.invalidPrice"));
      return;
    }

    setIsSubmitting(true);
    try {
      await addTransaction({
        vaultItemId: item._id as Id<"vaultItems">,
        transactionType: "sell",
        quantity,
        pricePerUnit: parsedPrice,
        currency: saleCurrency,
        transactionDate: saleDate,
        notes: notes || undefined,
      });
      onClose();
    } catch (err) {
      console.error("Failed to record sale:", err);
      setError(
        err instanceof ConvexError ? toErrorMessage(err) : t("errors.failed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {t("title", { name: item.displayName })}
            <MetalBadge metal={item.metalType} size="sm" />
          </DialogTitle>
          <DialogDescription>
            {t("description")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Current Holdings Info */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("currentHoldings")}
                </span>
                <span className="font-medium">
                  {t("units", { count: item.quantity })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("currentSellPrice")}
                </span>
                <span className="text-sm">
                  {formatCurrency(item.currentSellPrice, currency)}
                </span>
              </div>
              {item.averageCost !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("averageCost")}
                  </span>
                  <span className="text-sm">
                    {averageCostConverted === null
                      ? formatCurrency(item.averageCost, "eur")
                      : formatCurrency(averageCostConverted, currency)}
                  </span>
                </div>
              )}
            </div>

            <Separator />

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">{t("quantity")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="quantity"
                  type="number"
                  min={1}
                  max={maxQuantity}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(
                      Math.max(
                        1,
                        Math.min(maxQuantity, parseInt(e.target.value) || 1),
                      ),
                    )
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  {t("ofAvailable", { count: maxQuantity })}
                </span>
                {maxQuantity > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity(maxQuantity)}
                  >
                    {t("sellAll")}
                  </Button>
                )}
              </div>
            </div>

            {/* Price & Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price">{t("salePrice")}</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={pricePerUnit}
                  onChange={(e) => setPricePerUnit(e.target.value)}
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

            {/* Sale Date */}
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

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">{t("notes")}</Label>
              <Textarea
                id="notes"
                placeholder={t("notesPlaceholder")}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            {/* Sale Summary */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {t("totalSaleValue")}
                </span>
                <span className="font-semibold">
                  {formatCurrency(totalSaleValue, saleCurrency)}
                </span>
              </div>
              {saleProfit !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {t("estimatedProfitLoss")}
                  </span>
                  <div className="flex items-center gap-1">
                    {saleProfit >= 0 ? (
                      <TrendingUp className="h-3.5 w-3.5 text-profit" />
                    ) : (
                      <TrendingDown className="h-3.5 w-3.5 text-loss" />
                    )}
                    <span
                      className={cn(
                        "font-semibold",
                        saleProfit >= 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {formatCurrency(saleProfit, saleCurrency, { showSign: true })}
                      {saleProfitPercent !== null && (
                        <span className="text-xs ms-1">
                          ({formatPercent(saleProfitPercent, true, 1, 1)})
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {tActions("cancel")}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || quantity <= 0 || parsedPrice <= 0}
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              )}
              {t("submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
