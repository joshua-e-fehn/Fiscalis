"use client";

/**
 * CategoryOverrideMenu and ManualCategoryBadge
 *
 * The row action for changing which category an account or holding counts
 * under ("Change category", and "Reset to automatic" for a manual one), and
 * the marker shown next to a manual category. For a priced broker position
 * or Bitpanda holding it also sets the holding's own price ("Set price",
 * and "Use provider price" for an overridden one, ENG-239).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { CircleDollarSign, MoreHorizontal, RotateCcw, Tags } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";
import {
  useCategoryOverride,
  type CategoryOverrideItem,
} from "@/hooks/convex/classification";
import {
  useClearValuationOverride,
  type ValuationHoldingRef,
} from "@/hooks/convex/valuationOverrides";
import { useErrorMessage } from "@/i18n/errors";
import type { ValuationOverride } from "@/../services/pricing/valuationOverride";
import { ValuationOverrideDialog } from "@/components/atomic/molecules/valuation";
import { CategoryOverrideDialog } from "./CategoryOverrideDialog";

/** What the price items need: set when the holding can take an override. */
export interface ValuationMenuItem {
  holding: ValuationHoldingRef;
  quantity: number;
  providerPrice?: number;
  providerCurrency: string;
  override?: ValuationOverride;
}

interface CategoryOverrideMenuProps {
  item: CategoryOverrideItem;
  name: string;
  category?: string;
  subcategory?: string;
  isManual: boolean;
  /** Offers "Set price" when given */
  valuation?: ValuationMenuItem;
  className?: string;
}

export function CategoryOverrideMenu({
  item,
  name,
  category,
  subcategory,
  isManual,
  valuation,
  className,
}: CategoryOverrideMenuProps) {
  const t = useTranslations("categories.override");
  const tValuation = useTranslations("categories.valuation");
  const errorMessage = useErrorMessage();
  const [open, setOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const { reset, isPending } = useCategoryOverride();
  const clearValuation = useClearValuationOverride();

  const handleClearValuation = async () => {
    if (!valuation) return;
    try {
      await clearValuation({ holding: valuation.holding });
      toast.success(tValuation("toast.reset", { name }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const handleReset = async () => {
    try {
      await reset(item);
    } catch {
      toast.error(t("dialog.resetFailed"));
    }
  };

  return (
    <>
      {/* Not modal, so the dialog opened from it takes focus cleanly */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8", className)}
            aria-label={t("actionsLabel", { name })}
            // A row may be a link or clickable itself
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <Tags className="me-2 h-4 w-4" />
            {t("action")}
          </DropdownMenuItem>
          {isManual && (
            <DropdownMenuItem onSelect={handleReset} disabled={isPending}>
              <RotateCcw className="me-2 h-4 w-4" />
              {t("reset")}
            </DropdownMenuItem>
          )}
          {valuation && (
            <DropdownMenuItem onSelect={() => setPriceOpen(true)}>
              <CircleDollarSign className="me-2 h-4 w-4" />
              {tValuation("action")}
            </DropdownMenuItem>
          )}
          {valuation?.override && (
            <DropdownMenuItem onSelect={handleClearValuation}>
              <RotateCcw className="me-2 h-4 w-4" />
              {tValuation("reset")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <CategoryOverrideDialog
        open={open}
        onOpenChange={setOpen}
        item={item}
        name={name}
        category={category}
        subcategory={subcategory}
        isManual={isManual}
      />
      {valuation && (
        <ValuationOverrideDialog
          open={priceOpen}
          onOpenChange={setPriceOpen}
          name={name}
          {...valuation}
        />
      )}
    </>
  );
}

/** The small marker on a category the user chose themselves. */
export function ManualCategoryBadge({ className }: { className?: string }) {
  const t = useTranslations("categories.override");
  return (
    <Badge
      variant="outline"
      className={cn("px-1.5 py-0 text-[10px] font-normal", className)}
      title={t("manualHint")}
    >
      {t("manual")}
    </Badge>
  );
}
