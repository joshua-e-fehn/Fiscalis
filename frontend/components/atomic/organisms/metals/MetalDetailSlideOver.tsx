"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useFormatter, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/shadcn/alert-dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Separator } from "@/components/ui/shadcn/separator";
import {
  MetalBadge,
  PriceDisplay,
  DualWeightDisplay,
  ChangeIndicator,
  PurityBadge,
  CategoryBadge,
  StaggerContainer,
  StaggerItem,
} from "@/components/atomic/atoms/metals";
import {
  MetalItemWithValuation,
} from "@/lib/types/metals-extended";
import type { MetalsDisplayCurrency } from "@/lib/types/metals";
import { cn } from "@/lib/utils";
import {
  Edit2,
  Trash2,
  MapPin,
  Calendar,
  FileText,
  Loader2,
  BadgeDollarSign,
} from "lucide-react";
import { SellItemDialog } from "./SellItemDialog";
import { EditVaultItemDialog } from "./EditVaultItemDialog";

interface MetalDetailSlideOverProps {
  item: MetalItemWithValuation | null;
  isOpen: boolean;
  onClose: () => void;
  currency: MetalsDisplayCurrency;
}

export function MetalDetailSlideOver({
  item,
  isOpen,
  onClose,
  currency,
}: MetalDetailSlideOverProps) {
  const t = useTranslations("metals.detail");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSellOpen, setIsSellOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const deleteItem = useMutation(api.vault.deleteVaultItem);

  const handleDelete = async () => {
    if (!item) return;
    setIsDeleting(true);
    try {
      await deleteItem({ vaultItemId: item._id as Id<"vaultItems"> });
      onClose();
    } catch (error) {
      console.error("Failed to delete item:", error);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!item) return null;

  // A calendar date (YYYY-MM-DD), so formatted in UTC
  const purchaseDate = item.purchaseDate
    ? format.dateTime(new Date(item.purchaseDate), "dateOnly")
    : null;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <div className="flex items-start justify-between">
            <div className="flex-1 pr-4">
              <SheetTitle className="text-xl">{item.displayName}</SheetTitle>
              {item.catalogItem?.mint && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {item.catalogItem.mint}
                </p>
              )}
            </div>
            <MetalBadge metal={item.metalType} />
          </div>
        </SheetHeader>

        <StaggerContainer className="contents">
          {/* Main Value Display */}
          <StaggerItem>
            <div className="mt-6 p-4 rounded-lg bg-muted/50">
              <div className="text-sm text-muted-foreground mb-1">
                {t("currentValue")}
              </div>
              {item.marketValue === null ? (
                <>
                  <span className="text-2xl font-bold text-muted-foreground">
                    —
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {t("unknownValue")}
                  </p>
                </>
              ) : (
                <PriceDisplay
                  value={item.marketValue}
                  currency={currency}
                  size="xl"
                  className="font-bold"
                />
              )}
              {item.profitLoss !== null && item.profitLossPercent !== null && (
                <div className="mt-2">
                  <ChangeIndicator
                    value={item.profitLoss}
                    percentage={item.profitLossPercent}
                    currency={currency}
                    size="md"
                  />
                  <span className="text-sm text-muted-foreground ml-2">
                    {t("sincePurchase")}
                  </span>
                </div>
              )}
            </div>
          </StaggerItem>

          {/* Item Details */}
          <StaggerItem>
            <div className="mt-6 space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                {t("itemDetails")}
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <DetailRow label={t("category")}>
                  <CategoryBadge category={item.category} />
                </DetailRow>
                <DetailRow label={t("purity")}>
                  <PurityBadge
                    purity={item.purity}
                    showKarat={item.metalType === "gold"}
                  />
                </DetailRow>
                <DetailRow label={t("quantity")}>
                  <span className="font-medium">{item.quantity}</span>
                </DetailRow>
                <DetailRow label={t("totalWeight")}>
                  <DualWeightDisplay grams={item.weightGrams * item.quantity} />
                </DetailRow>
                <DetailRow label={t("fineWeight")}>
                  <DualWeightDisplay
                    grams={item.fineWeightGrams * item.quantity}
                  />
                </DetailRow>
                <DetailRow label={t("buyPremium")}>
                  <span className="font-medium">
                    {item.buyPremium >= 0 ? "+" : ""}
                    {(item.buyPremium * 100).toFixed(1)}%
                  </span>
                </DetailRow>
                <DetailRow label={t("sellPremium")}>
                  <span
                    className={cn(
                      "font-medium",
                      item.sellPremium < 0 ? "text-loss" : "text-profit",
                    )}
                  >
                    {item.sellPremium >= 0 ? "+" : ""}
                    {(item.sellPremium * 100).toFixed(1)}%
                  </span>
                </DetailRow>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem>
            <Separator className="my-6" />

            {/* Valuation Details */}
            <div className="space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                {t("valuation")}
              </h3>

              <div className="space-y-3">
                <DetailRowFull label={t("currentBuyPrice")}>
                  <PriceDisplay
                    value={item.currentBuyPrice}
                    currency={currency}
                    size="md"
                  />
                </DetailRowFull>
                <DetailRowFull label={t("currentSellPrice")}>
                  <PriceDisplay
                    value={item.currentSellPrice}
                    currency={currency}
                    size="md"
                  />
                </DetailRowFull>
                <DetailRowFull label={t("meltValue")}>
                  <PriceDisplay
                    value={item.meltValue}
                    currency={currency}
                    size="md"
                  />
                </DetailRowFull>
                <DetailRowFull label={t("marketValue")}>
                  {item.marketValue === null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <PriceDisplay
                      value={item.marketValue}
                      currency={currency}
                      size="md"
                    />
                  )}
                </DetailRowFull>
                {item.totalCost !== null && (
                  <DetailRowFull label={t("totalCost")}>
                    <PriceDisplay
                      value={item.totalCost}
                      currency={currency}
                      size="md"
                    />
                  </DetailRowFull>
                )}
              </div>
            </div>
          </StaggerItem>

          {/* Purchase Info */}
          {(item.purchasePricePerUnit ||
            item.purchaseDate ||
            item.storageLocation) && (
            <StaggerItem>
              <Separator className="my-6" />
              <div className="space-y-4">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {t("purchaseInfo")}
                </h3>

                <div className="space-y-3">
                  {item.purchasePricePerUnit && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          {t("pricePerUnit")}
                        </div>
                        <PriceDisplay
                          value={item.purchasePricePerUnit}
                          // useMetals converts the unit cost into the display currency
                          currency={currency}
                          size="md"
                        />
                      </div>
                    </div>
                  )}
                  {purchaseDate && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          {t("purchaseDate")}
                        </div>
                        <div className="font-medium">{purchaseDate}</div>
                      </div>
                    </div>
                  )}
                  {item.storageLocation && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          {t("storageLocation")}
                        </div>
                        <div className="font-medium">
                          {item.storageLocation}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </StaggerItem>
          )}

          {/* Notes */}
          {item.notes && (
            <StaggerItem>
              <Separator className="my-6" />
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                  {t("notes")}
                </h3>
                <p className="text-sm">{item.notes}</p>
              </div>
            </StaggerItem>
          )}

          {/* Actions */}
          <StaggerItem>
            <div className="flex flex-col gap-3 mt-8 pt-6 border-t">
              {/* Primary Action: Sell */}
              {item.quantity > 0 && (
                <Button
                  variant="default"
                  onClick={() => setIsSellOpen(true)}
                  className="w-full"
                >
                  <BadgeDollarSign className="h-4 w-4 mr-2" />
                  {t("sell")}
                </Button>
              )}

              {/* Secondary Actions */}
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setIsEditOpen(true)}
                  className="flex-1"
                >
                  <Edit2 className="h-4 w-4 mr-2" />
                  {tActions("edit")}
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "text-destructive hover:text-destructive hover:bg-destructive/10",
                        "flex-1",
                      )}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      {tActions("delete")}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("deleteDescription", { name: item.displayName })}
                        <br />
                        <br />
                        {t.rich("deleteTip", {
                          strong: (chunks) => <strong>{chunks}</strong>,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        {tActions("delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </StaggerItem>
        </StaggerContainer>

        {/* Sell Dialog */}
        <SellItemDialog
          item={item}
          isOpen={isSellOpen}
          onClose={() => setIsSellOpen(false)}
          // The item's valuation currency (the display currency)
          currency={currency}
        />

        {/* Edit Dialog: details and opening balance (vault.updateVaultItem) */}
        <EditVaultItemDialog
          item={item}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

// Helper components
function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

function DetailRowFull({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
