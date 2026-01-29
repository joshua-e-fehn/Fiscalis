"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
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
  WeightDisplay,
  DualWeightDisplay,
  ChangeIndicator,
  PurityBadge,
  CategoryBadge,
  FadeIn,
  StaggerContainer,
  StaggerItem,
} from "@/components/atomic/atoms/metals";
import {
  MetalItemWithValuation,
  MetalsCurrency,
} from "@/lib/types/metals-extended";
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

interface MetalDetailSlideOverProps {
  item: MetalItemWithValuation | null;
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  currency?: MetalsCurrency;
  onEdit?: (item: MetalItemWithValuation) => void;
}

export function MetalDetailSlideOver({
  item,
  isOpen,
  onClose,
  userId,
  currency = "eur",
  onEdit,
}: MetalDetailSlideOverProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isSellOpen, setIsSellOpen] = useState(false);

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

  const purchaseDate = item.purchaseDate
    ? new Date(item.purchaseDate).toLocaleDateString("de-DE", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
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
                Current Value
              </div>
              <PriceDisplay
                value={item.marketValue ?? 0}
                currency={currency}
                size="xl"
                className="font-bold"
              />
              {item.profitLoss !== null && item.profitLossPercent !== null && (
                <div className="mt-2">
                  <ChangeIndicator
                    value={item.profitLoss}
                    percentage={item.profitLossPercent}
                    currency={currency}
                    size="md"
                  />
                  <span className="text-sm text-muted-foreground ml-2">
                    since purchase
                  </span>
                </div>
              )}
            </div>
          </StaggerItem>

          {/* Item Details */}
          <StaggerItem>
            <div className="mt-6 space-y-4">
              <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                Item Details
              </h3>

              <div className="grid grid-cols-2 gap-4">
                <DetailRow label="Category">
                  <CategoryBadge category={item.category} />
                </DetailRow>
                <DetailRow label="Purity">
                  <PurityBadge
                    purity={item.purity}
                    showKarat={item.metalType === "gold"}
                  />
                </DetailRow>
                <DetailRow label="Quantity">
                  <span className="font-medium">{item.quantity}</span>
                </DetailRow>
                <DetailRow label="Total Weight">
                  <DualWeightDisplay grams={item.weightGrams * item.quantity} />
                </DetailRow>
                <DetailRow label="Fine Weight">
                  <DualWeightDisplay
                    grams={item.fineWeightGrams * item.quantity}
                  />
                </DetailRow>
                <DetailRow label="Buy Premium">
                  <span className="font-medium">
                    {item.buyPremium >= 0 ? "+" : ""}
                    {(item.buyPremium * 100).toFixed(1)}%
                  </span>
                </DetailRow>
                <DetailRow label="Sell Premium">
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
                Valuation
              </h3>

              <div className="space-y-3">
                <DetailRowFull label="Current Buy Price (per unit)">
                  <PriceDisplay
                    value={item.currentBuyPrice}
                    currency={currency}
                    size="md"
                  />
                </DetailRowFull>
                <DetailRowFull label="Current Sell Price (per unit)">
                  <PriceDisplay
                    value={item.currentSellPrice}
                    currency={currency}
                    size="md"
                  />
                </DetailRowFull>
                <DetailRowFull label="Melt Value (total)">
                  <PriceDisplay
                    value={item.meltValue}
                    currency={currency}
                    size="md"
                  />
                </DetailRowFull>
                <DetailRowFull label="Market Value (total at sell price)">
                  <PriceDisplay
                    value={item.marketValue}
                    currency={currency}
                    size="md"
                  />
                </DetailRowFull>
                {item.totalCost !== null && (
                  <DetailRowFull label="Total Cost">
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
                  Purchase Info
                </h3>

                <div className="space-y-3">
                  {item.purchasePricePerUnit && (
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">
                          Price per Unit
                        </div>
                        <PriceDisplay
                          value={item.purchasePricePerUnit}
                          currency={
                            (item.purchaseCurrency?.toLowerCase() as MetalsCurrency) ??
                            currency
                          }
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
                          Purchase Date
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
                          Storage Location
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
                  Notes
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
                  Sell Item
                </Button>
              )}

              {/* Secondary Actions */}
              <div className="flex gap-3">
                {onEdit && (
                  <Button
                    variant="outline"
                    onClick={() => onEdit(item)}
                    className="flex-1"
                  >
                    <Edit2 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "text-destructive hover:text-destructive hover:bg-destructive/10",
                        onEdit ? "flex-1" : "w-full",
                      )}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Item?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete "{item.displayName}" from
                        your vault including all transaction history. This
                        action cannot be undone.
                        <br />
                        <br />
                        <strong>Tip:</strong> If you sold this item, use the
                        "Sell Item" button instead to record the sale and track
                        your realized P/L.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleDelete}
                        disabled={isDeleting}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {isDeleting && (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        Delete
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
          userId={userId}
          currency={currency}
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
