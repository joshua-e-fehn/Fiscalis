"use client";

import * as React from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import { Label } from "@/components/ui/shadcn/label";
import { Loader2, RotateCcw, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  InvestmentCategory,
  InvestmentSubcategory,
  categoryDisplayNames,
  subcategoriesByCategory,
  subcategoryDisplayNames,
} from "@/lib/types/classification";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface ClassificationOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: "plaid" | "broker";
  itemId: Id<"plaidAccounts"> | Id<"brokerPositions">;
  itemName: string;
  onSuccess?: () => void;
}

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function ClassificationOverrideDialog({
  open,
  onOpenChange,
  itemType,
  itemId,
  itemName,
  onSuccess,
}: ClassificationOverrideDialogProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<
    InvestmentCategory | ""
  >("");
  const [selectedSubcategory, setSelectedSubcategory] = React.useState<
    InvestmentSubcategory | ""
  >("");
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);

  // Fetch current classification details
  const plaidClassification = useQuery(
    api.classification.getPlaidAccountClassification,
    itemType === "plaid"
      ? { accountId: itemId as Id<"plaidAccounts"> }
      : "skip",
  );

  const brokerClassification = useQuery(
    api.classification.getBrokerPositionClassification,
    itemType === "broker"
      ? { positionId: itemId as Id<"brokerPositions"> }
      : "skip",
  );

  const classification =
    itemType === "plaid" ? plaidClassification : brokerClassification;

  // Mutations
  const overridePlaid = useMutation(
    api.classification.overridePlaidAccountClassification,
  );
  const overrideBroker = useMutation(
    api.classification.overrideBrokerPositionClassification,
  );
  const resetPlaid = useMutation(
    api.classification.resetPlaidAccountClassification,
  );
  const resetBroker = useMutation(
    api.classification.resetBrokerPositionClassification,
  );

  // Initialize selected values when classification data loads
  React.useEffect(() => {
    if (classification) {
      setSelectedCategory(
        (classification.currentCategory as InvestmentCategory) || "",
      );
      setSelectedSubcategory(
        (classification.currentSubcategory as InvestmentSubcategory) || "",
      );
    }
  }, [classification]);

  // Get available subcategories for selected category
  const availableSubcategories = selectedCategory
    ? subcategoriesByCategory[selectedCategory]
    : [];

  // Reset subcategory when category changes
  React.useEffect(() => {
    if (
      selectedCategory &&
      selectedSubcategory &&
      !availableSubcategories.includes(selectedSubcategory)
    ) {
      setSelectedSubcategory("");
    }
  }, [selectedCategory, selectedSubcategory, availableSubcategories]);

  // Handle save
  const handleSave = async () => {
    if (!selectedCategory || !selectedSubcategory) return;

    setIsSubmitting(true);
    try {
      if (itemType === "plaid") {
        await overridePlaid({
          accountId: itemId as Id<"plaidAccounts">,
          category: selectedCategory,
          subcategory: selectedSubcategory,
        });
      } else {
        await overrideBroker({
          positionId: itemId as Id<"brokerPositions">,
          category: selectedCategory,
          subcategory: selectedSubcategory,
        });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to override classification:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle reset to auto
  const handleReset = async () => {
    setIsResetting(true);
    try {
      if (itemType === "plaid") {
        await resetPlaid({
          accountId: itemId as Id<"plaidAccounts">,
        });
      } else {
        await resetBroker({
          positionId: itemId as Id<"brokerPositions">,
        });
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to reset classification:", error);
    } finally {
      setIsResetting(false);
    }
  };

  const isLoading = classification === undefined;
  const hasUserOverride = classification?.hasUserOverride ?? false;
  const canSave =
    selectedCategory &&
    selectedSubcategory &&
    (selectedCategory !== classification?.currentCategory ||
      selectedSubcategory !== classification?.currentSubcategory);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Change Classification</DialogTitle>
          <DialogDescription>
            Manually assign a category for &quot;{itemName}&quot;. This override
            will persist even when data is synced.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Current Classification Info */}
            <div className="rounded-lg border p-3 space-y-2 bg-muted/50">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Current Classification
                </span>
                {hasUserOverride ? (
                  <Badge variant="secondary" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    User Override
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Auto
                  </Badge>
                )}
              </div>
              <div className="text-sm font-medium">
                {classification?.currentCategory
                  ? categoryDisplayNames[
                      classification.currentCategory as InvestmentCategory
                    ]
                  : "Unclassified"}{" "}
                →{" "}
                {classification?.currentSubcategory
                  ? subcategoryDisplayNames[
                      classification.currentSubcategory as InvestmentSubcategory
                    ]
                  : "None"}
              </div>
              {classification?.autoRuleName && (
                <div className="text-xs text-muted-foreground">
                  Auto rule: {classification.autoRuleName}
                </div>
              )}
            </div>

            {/* Category Selection */}
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={selectedCategory}
                onValueChange={(value) =>
                  setSelectedCategory(value as InvestmentCategory)
                }
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {(
                    Object.keys(categoryDisplayNames) as InvestmentCategory[]
                  ).map((category) => (
                    <SelectItem key={category} value={category}>
                      {categoryDisplayNames[category]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Subcategory Selection */}
            <div className="space-y-2">
              <Label htmlFor="subcategory">Subcategory</Label>
              <Select
                value={selectedSubcategory}
                onValueChange={(value) =>
                  setSelectedSubcategory(value as InvestmentSubcategory)
                }
                disabled={!selectedCategory}
              >
                <SelectTrigger id="subcategory">
                  <SelectValue
                    placeholder={
                      selectedCategory
                        ? "Select a subcategory"
                        : "Select a category first"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableSubcategories.map((subcategory) => (
                    <SelectItem key={subcategory} value={subcategory}>
                      {subcategoryDisplayNames[subcategory]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Auto Classification Info */}
            {hasUserOverride && classification?.autoCategory && (
              <div className="rounded-lg border border-dashed p-3 space-y-1">
                <div className="text-xs text-muted-foreground">
                  Auto-classification would be:
                </div>
                <div className="text-sm">
                  {
                    categoryDisplayNames[
                      classification.autoCategory as InvestmentCategory
                    ]
                  }{" "}
                  →{" "}
                  {classification.autoSubcategory
                    ? subcategoryDisplayNames[
                        classification.autoSubcategory as InvestmentSubcategory
                      ]
                    : "None"}
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-col sm:flex-row gap-2">
          {hasUserOverride && (
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isResetting || isSubmitting}
              className="w-full sm:w-auto"
            >
              {isResetting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reset to Auto
            </Button>
          )}
          <div className="flex gap-2 w-full sm:w-auto">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!canSave || isSubmitting || isResetting}
              className="flex-1 sm:flex-none"
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
