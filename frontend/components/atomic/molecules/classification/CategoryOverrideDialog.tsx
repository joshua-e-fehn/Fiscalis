"use client";

/**
 * CategoryOverrideDialog
 *
 * Picks the category and subcategory a bank account, broker position or
 * Bitpanda holding counts under, from the shared taxonomy, and saves it as
 * a manual category (useCategoryOverride). A manual category can be reset
 * to the automatic one here too.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  useCategoryOverride,
  type CategoryOverrideItem,
} from "@/hooks/convex/classification";
import {
  overrideCategoriesFor,
  subcategoriesByCategory,
  subcategoryForCategory,
  type InvestmentCategory,
  type InvestmentSubcategory,
} from "@/lib/types/classification";
import { subcategoryLabel, useCategoryLabels } from "@/lib/config/categoryUI";

export interface CategoryOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: CategoryOverrideItem;
  /** The item's name, shown in the description */
  name: string;
  /** The stored category and subcategory, preselected */
  category?: string;
  subcategory?: string;
  /** Whether the stored category is a manual one (offers the reset) */
  isManual: boolean;
}

export function CategoryOverrideDialog(props: CategoryOverrideDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Remounted on every open, so the selection starts from the item */}
      {props.open && <CategoryOverrideForm {...props} />}
    </Dialog>
  );
}

function CategoryOverrideForm({
  onOpenChange,
  item,
  name,
  category: storedCategory,
  subcategory: storedSubcategory,
  isManual,
}: CategoryOverrideDialogProps) {
  const t = useTranslations("categories.override");
  const tActions = useTranslations("common.actions");
  const labels = useCategoryLabels();
  const { save, reset, isPending } = useCategoryOverride();

  const allowed = overrideCategoriesFor(item.target);
  const initialCategory: InvestmentCategory =
    allowed.find((c) => c === storedCategory) ?? allowed[0];
  const [category, setCategory] = useState(initialCategory);
  const [subcategory, setSubcategory] = useState<InvestmentSubcategory>(() =>
    subcategoryForCategory(initialCategory, storedSubcategory),
  );
  const [error, setError] = useState<string | null>(null);

  const unchanged =
    isManual &&
    category === storedCategory &&
    subcategory === storedSubcategory;

  const handleCategory = (value: string) => {
    const next = allowed.find((c) => c === value);
    if (!next) return;
    setCategory(next);
    setSubcategory((current) => subcategoryForCategory(next, current));
  };

  const handleSave = async () => {
    setError(null);
    try {
      await save(item, category, subcategory);
      onOpenChange(false);
    } catch {
      setError(t("dialog.saveFailed"));
    }
  };

  const handleReset = async () => {
    setError(null);
    try {
      await reset(item);
      onOpenChange(false);
    } catch {
      setError(t("dialog.resetFailed"));
    }
  };

  const subcategoryName = (slug: InvestmentSubcategory) => {
    const label = subcategoryLabel(category, slug);
    return label ? labels.name(label) : slug;
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("dialog.title")}</DialogTitle>
        <DialogDescription>{t("dialog.description", { name })}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="override-category">{t("dialog.category")}</Label>
          <Select value={category} onValueChange={handleCategory}>
            <SelectTrigger id="override-category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowed.map((c) => (
                <SelectItem key={c} value={c}>
                  {labels.categoryName(c)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {item.target === "plaid" && (
            <p className="text-xs text-muted-foreground">
              {t("dialog.bankHint")}
            </p>
          )}
        </div>

        <div className="grid gap-2">
          <Label htmlFor="override-subcategory">
            {t("dialog.subcategory")}
          </Label>
          <Select
            value={subcategory}
            onValueChange={(value) =>
              setSubcategory(subcategoryForCategory(category, value))
            }
          >
            <SelectTrigger id="override-subcategory">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {subcategoriesByCategory[category].map((slug) => (
                <SelectItem key={slug} value={slug}>
                  {subcategoryName(slug)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {isManual ? (
          <Button
            type="button"
            variant="ghost"
            onClick={handleReset}
            disabled={isPending}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("reset")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            {tActions("cancel")}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={isPending || unchanged}
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tActions("save")}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
