"use client";

import { useEffect, useState } from "react";
import { ConvexError } from "convex/values";
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
import { MetalBadge } from "@/components/atomic/atoms/metals";
import { MetalItemWithValuation } from "@/lib/types/metals-extended";
import { useMetalItem, useUpdateMetalItem } from "@/hooks/convex/metals";
import { todayLocalISO } from "@/lib/utils/date";
import { Loader2, AlertCircle } from "lucide-react";

interface EditVaultItemDialogProps {
  item: MetalItemWithValuation;
  isOpen: boolean;
  onClose: () => void;
}

type UpdateArgs = Parameters<ReturnType<typeof useUpdateMetalItem>>[0];

/** A percent field as a decimal ("2.5" → 0.025); null when not a number. */
function parsePercent(value: string): number | null {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n / 100 : null;
}

const toPercent = (decimal: number) => String(Math.round(decimal * 10000) / 100);

/**
 * Edit a vault item: its name, premiums, storage and notes, and its opening
 * balance (quantity, price, currency, date) through vault.updateVaultItem,
 * which validates the ledger. Only changed fields are sent, so an unchanged
 * opening keeps its stored EUR price. A server rejection is shown as is.
 */
export function EditVaultItemDialog({
  item,
  isOpen,
  onClose,
}: EditVaultItemDialogProps) {
  const updateItem = useUpdateMetalItem();
  const { transactions } = useMetalItem(item._id as Id<"vaultItems">);
  const opening = transactions?.find((tx) => tx.isOpening);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [buyPremium, setBuyPremium] = useState("");
  const [sellPremium, setSellPremium] = useState("");
  const [storageLocation, setStorageLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [openingQuantity, setOpeningQuantity] = useState("");
  const [openingPrice, setOpeningPrice] = useState("");
  const [openingCurrency, setOpeningCurrency] = useState("EUR");
  const [openingDate, setOpeningDate] = useState("");

  // Reset the form whenever the dialog opens (and once the opening loads)
  const openingId = opening?._id;
  useEffect(() => {
    if (!isOpen) return;
    setName(item.customName ?? "");
    setBuyPremium(toPercent(item.buyPremium));
    setSellPremium(toPercent(item.sellPremium));
    setStorageLocation(item.storageLocation ?? "");
    setNotes(item.notes ?? "");
    setOpeningQuantity(opening ? String(opening.quantity) : "");
    setOpeningPrice(opening?.pricePerUnit != null ? String(opening.pricePerUnit) : "");
    setOpeningCurrency(opening?.currency ?? "EUR");
    setOpeningDate(opening?.transactionDate?.slice(0, 10) ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item._id, openingId]);

  /** The changed fields, or an error message for an invalid entry. */
  const buildUpdate = (): UpdateArgs | string => {
    const update: UpdateArgs = { vaultItemId: item._id as Id<"vaultItems"> };

    const trimmedName = name.trim();
    if (trimmedName !== (item.customName ?? "") && trimmedName !== "") {
      update.customName = trimmedName;
    }
    const buy = parsePercent(buyPremium);
    const sell = parsePercent(sellPremium);
    if (buy === null || sell === null) return "Premiums must be numbers";
    if (Math.abs(buy - item.buyPremium) > 1e-9) update.buyPremium = buy;
    if (Math.abs(sell - item.sellPremium) > 1e-9) update.sellPremium = sell;
    if (storageLocation !== (item.storageLocation ?? "")) {
      update.storageLocation = storageLocation;
    }
    if (notes !== (item.notes ?? "")) update.notes = notes;

    if (opening) {
      const quantity = parseFloat(openingQuantity);
      if (!Number.isFinite(quantity)) return "Opening quantity must be a number";
      // The mutation takes the quantity held and moves the opening by the
      // difference, so the later buys and sales stay as recorded
      if (quantity !== opening.quantity) {
        update.quantity = item.quantity + (quantity - opening.quantity);
      }
      if (openingPrice.trim() !== "") {
        const price = parseFloat(openingPrice);
        if (!Number.isFinite(price)) return "Price per unit must be a number";
        if (price !== opening.pricePerUnit) update.purchasePricePerUnit = price;
      }
      if (openingCurrency !== opening.currency) {
        update.purchaseCurrency = openingCurrency;
      }
      if (openingDate !== "" && openingDate !== opening.transactionDate?.slice(0, 10)) {
        update.purchaseDate = openingDate;
      }
    }
    return update;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const update = buildUpdate();
    if (typeof update === "string") {
      setError(update);
      return;
    }
    if (Object.keys(update).length === 1) {
      onClose();
      return;
    }
    setIsSubmitting(true);
    try {
      await updateItem(update);
      onClose();
    } catch (err) {
      console.error("Failed to update item:", err);
      setError(
        err instanceof ConvexError
          ? String(err.data)
          : "Failed to save the changes. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Edit {item.displayName}
            <MetalBadge metal={item.metalType} size="sm" />
          </DialogTitle>
          <DialogDescription>
            Change the item&apos;s details and its opening balance. Later buys
            and sales are edited as transactions.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                placeholder={item.displayName}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-buy-premium">Buy premium (%)</Label>
                <Input
                  id="edit-buy-premium"
                  type="number"
                  step="0.1"
                  value={buyPremium}
                  onChange={(e) => setBuyPremium(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sell-premium">Sell premium (%)</Label>
                <Input
                  id="edit-sell-premium"
                  type="number"
                  step="0.1"
                  value={sellPremium}
                  onChange={(e) => setSellPremium(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-storage">Storage location</Label>
              <Input
                id="edit-storage"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">Opening balance</h4>
              {transactions === undefined ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading…
                </div>
              ) : !opening ? (
                <p className="text-sm text-muted-foreground">
                  This item has no opening balance; record a buy or sale
                  instead.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-opening-quantity">Quantity</Label>
                    <Input
                      id="edit-opening-quantity"
                      type="number"
                      step="any"
                      value={openingQuantity}
                      onChange={(e) => setOpeningQuantity(e.target.value)}
                      className="w-32"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="edit-opening-price">Price per unit</Label>
                      <Input
                        id="edit-opening-price"
                        type="number"
                        step="0.01"
                        placeholder="Unknown"
                        value={openingPrice}
                        onChange={(e) => setOpeningPrice(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-opening-currency">Currency</Label>
                      <Select value={openingCurrency} onValueChange={setOpeningCurrency}>
                        <SelectTrigger id="edit-opening-currency">
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
                  <div className="space-y-2">
                    <Label htmlFor="edit-opening-date">Purchase date</Label>
                    <Input
                      id="edit-opening-date"
                      type="date"
                      value={openingDate}
                      onChange={(e) => setOpeningDate(e.target.value)}
                      max={todayLocalISO()}
                    />
                    {opening.transactionDate == null && openingDate === "" && (
                      <p className="text-xs text-muted-foreground">
                        Unknown: held since before any range
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {error && (
              <div className="flex items-center gap-2 text-sm text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
