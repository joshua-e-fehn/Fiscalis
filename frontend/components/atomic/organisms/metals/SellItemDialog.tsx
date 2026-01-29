"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Separator } from "@/components/ui/shadcn/separator";
import {
  MetalBadge,
  PriceDisplay,
  ChangeIndicator,
} from "@/components/atomic/atoms/metals";
import {
  MetalItemWithValuation,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
import { cn } from "@/lib/utils";
import { Loader2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";

interface SellItemDialogProps {
  item: MetalItemWithValuation | null;
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currency?: MetalsCurrency;
}

export function SellItemDialog({
  item,
  isOpen,
  onClose,
  userId,
  currency = "eur",
}: SellItemDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [quantity, setQuantity] = useState(1);
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [saleCurrency, setSaleCurrency] = useState<string>(
    currency.toUpperCase(),
  );
  const [saleDate, setSaleDate] = useState(
    new Date().toISOString().split("T")[0],
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
      setSaleDate(new Date().toISOString().split("T")[0]);
      setNotes("");
      setError(null);
    }
  }, [item, isOpen, currency]);

  if (!item) return null;

  const maxQuantity = item.quantity;
  const parsedPrice = parseFloat(pricePerUnit) || 0;
  const totalSaleValue = parsedPrice * quantity;

  // Calculate profit/loss for this sale
  const costBasis = item.purchasePricePerUnit
    ? item.purchasePricePerUnit * quantity
    : null;
  const saleProfit = costBasis !== null ? totalSaleValue - costBasis : null;
  const saleProfitPercent =
    costBasis !== null && costBasis > 0
      ? ((totalSaleValue - costBasis) / costBasis) * 100
      : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (quantity <= 0 || quantity > maxQuantity) {
      setError(`Quantity must be between 1 and ${maxQuantity}`);
      return;
    }

    if (parsedPrice <= 0) {
      setError("Please enter a valid sale price");
      return;
    }

    setIsSubmitting(true);
    try {
      await addTransaction({
        userId,
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
      setError("Failed to record sale. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Sell {item.displayName}
            <MetalBadge metal={item.metalType} size="sm" />
          </DialogTitle>
          <DialogDescription>
            Record a sale transaction for this item. The quantity will be
            deducted from your holdings.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            {/* Current Holdings Info */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Holdings</span>
                <span className="font-medium">{item.quantity} units</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  Current Sell Price (each)
                </span>
                <PriceDisplay
                  value={item.currentSellPrice}
                  currency={currency}
                  size="sm"
                />
              </div>
              {item.purchasePricePerUnit && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Cost Basis (each)
                  </span>
                  <PriceDisplay
                    value={item.purchasePricePerUnit}
                    currency={
                      (item.purchaseCurrency?.toLowerCase() as MetalsCurrency) ||
                      currency
                    }
                    size="sm"
                  />
                </div>
              )}
            </div>

            <Separator />

            {/* Quantity */}
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity to Sell</Label>
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
                  of {maxQuantity} available
                </span>
                {maxQuantity > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setQuantity(maxQuantity)}
                  >
                    Sell All
                  </Button>
                )}
              </div>
            </div>

            {/* Price & Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="price">Sale Price (per unit)</Label>
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

            {/* Sale Date */}
            <div className="space-y-2">
              <Label htmlFor="saleDate">Sale Date</Label>
              <Input
                id="saleDate"
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                max={new Date().toISOString().split("T")[0]}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                placeholder="e.g., Sold to dealer, auction sale..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            {/* Sale Summary */}
            <div className="p-3 rounded-lg bg-muted/50 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total Sale Value</span>
                <span className="font-semibold">
                  {saleCurrency === "EUR"
                    ? "€"
                    : saleCurrency === "USD"
                      ? "$"
                      : "Fr."}
                  {totalSaleValue.toLocaleString("de-CH", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              {saleProfit !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    Estimated Profit/Loss
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
                      {saleProfit >= 0 ? "+" : ""}
                      {saleCurrency === "EUR"
                        ? "€"
                        : saleCurrency === "USD"
                          ? "$"
                          : "Fr."}
                      {saleProfit.toLocaleString("de-CH", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                      {saleProfitPercent !== null && (
                        <span className="text-xs ml-1">
                          ({saleProfitPercent >= 0 ? "+" : ""}
                          {saleProfitPercent.toFixed(1)}%)
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
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || quantity <= 0 || parsedPrice <= 0}
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Record Sale
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
