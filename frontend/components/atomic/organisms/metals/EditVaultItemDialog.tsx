"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
import { MetalItemWithValuation } from "@/lib/types/metals-extended";
import { useMetalItem, useUpdateMetalItem } from "@/hooks/convex/metals";
import { todayLocalISO } from "@/lib/utils/date";
import { useErrorMessage } from "@/i18n/errors";
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
 * opening keeps its stored EUR price. A server rejection is shown in the
 * user's language (useErrorMessage).
 */
export function EditVaultItemDialog({
  item,
  isOpen,
  onClose,
}: EditVaultItemDialogProps) {
  const t = useTranslations("metals.edit");
  const tActions = useTranslations("common.actions");
  const toErrorMessage = useErrorMessage();
  const updateItem = useUpdateMetalItem();
  const { item: liveItem, transactions } = useMetalItem(
    item._id as Id<"vaultItems">,
  );
  // The item the caller passed is a snapshot; compare against the live one
  // so a second edit in the same slide-over starts from the saved values
  const current = liveItem ?? item;
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

  // Reset the form whenever the dialog opens (and once the live item and
  // the opening load)
  const openingId = opening?._id;
  const liveLoaded = liveItem !== undefined;
  useEffect(() => {
    if (!isOpen) return;
    setName(current.customName ?? "");
    setBuyPremium(toPercent(current.buyPremium));
    setSellPremium(toPercent(current.sellPremium));
    setStorageLocation(current.storageLocation ?? "");
    setNotes(current.notes ?? "");
    setOpeningQuantity(opening ? String(opening.quantity) : "");
    setOpeningPrice(opening?.pricePerUnit != null ? String(opening.pricePerUnit) : "");
    setOpeningCurrency(opening?.currency ?? "EUR");
    setOpeningDate(opening?.transactionDate?.slice(0, 10) ?? "");
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, item._id, openingId, liveLoaded]);

  /** The changed fields, or an error message for an invalid entry. */
  const buildUpdate = (): UpdateArgs | string => {
    const update: UpdateArgs = { vaultItemId: item._id as Id<"vaultItems"> };

    const trimmedName = name.trim();
    if (trimmedName !== (current.customName ?? "") && trimmedName !== "") {
      update.customName = trimmedName;
    }
    const buy = parsePercent(buyPremium);
    const sell = parsePercent(sellPremium);
    if (buy === null || sell === null) return t("errors.premiumsNotNumbers");
    if (Math.abs(buy - current.buyPremium) > 1e-9) update.buyPremium = buy;
    if (Math.abs(sell - current.sellPremium) > 1e-9) update.sellPremium = sell;
    if (storageLocation !== (current.storageLocation ?? "")) {
      update.storageLocation = storageLocation;
    }
    if (notes !== (current.notes ?? "")) update.notes = notes;

    if (opening) {
      const quantity = parseFloat(openingQuantity);
      if (!Number.isFinite(quantity)) return t("errors.quantityNotNumber");
      // Sent as the opening's own quantity: the mutation resolves it against
      // the ledger it reads, so no client-side total (which can be stale
      // after an earlier edit) feeds into it
      if (quantity !== opening.quantity) update.openingQuantity = quantity;
      if (openingPrice.trim() !== "") {
        const price = parseFloat(openingPrice);
        if (!Number.isFinite(price)) return t("errors.priceNotNumber");
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
      setError(toErrorMessage(err, "saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
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
            <div className="space-y-2">
              <Label htmlFor="edit-name">{t("name")}</Label>
              <Input
                id="edit-name"
                placeholder={item.displayName}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="edit-buy-premium">{t("buyPremium")}</Label>
                <Input
                  id="edit-buy-premium"
                  type="number"
                  step="0.1"
                  value={buyPremium}
                  onChange={(e) => setBuyPremium(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-sell-premium">{t("sellPremium")}</Label>
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
              <Label htmlFor="edit-storage">{t("storageLocation")}</Label>
              <Input
                id="edit-storage"
                value={storageLocation}
                onChange={(e) => setStorageLocation(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-notes">{t("notes")}</Label>
              <Textarea
                id="edit-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>

            <Separator />

            <div className="space-y-3">
              <h4 className="text-sm font-medium">{t("openingBalance")}</h4>
              {transactions === undefined ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {tActions("loading")}
                </div>
              ) : !opening ? (
                <p className="text-sm text-muted-foreground">
                  {t("noOpening")}
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-opening-quantity">{t("quantity")}</Label>
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
                      <Label htmlFor="edit-opening-price">{t("pricePerUnit")}</Label>
                      <Input
                        id="edit-opening-price"
                        type="number"
                        step="0.01"
                        placeholder={t("unknown")}
                        value={openingPrice}
                        onChange={(e) => setOpeningPrice(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="edit-opening-currency">{t("currency")}</Label>
                      {/* The opening's stored currency, kept even when it
                          is not a display currency */}
                      <CurrencySelect
                        id="edit-opening-currency"
                        value={openingCurrency}
                        onValueChange={setOpeningCurrency}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-opening-date">{t("purchaseDate")}</Label>
                    <Input
                      id="edit-opening-date"
                      type="date"
                      value={openingDate}
                      onChange={(e) => setOpeningDate(e.target.value)}
                      max={todayLocalISO()}
                    />
                    {opening.transactionDate == null && openingDate === "" && (
                      <p className="text-xs text-muted-foreground">
                        {t("unknownDate")}
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
              {tActions("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
              {tActions("save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
