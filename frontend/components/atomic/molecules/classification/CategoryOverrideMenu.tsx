"use client";

/**
 * CategoryOverrideMenu and ManualCategoryBadge
 *
 * The row action for changing which category an account or holding counts
 * under ("Change category", and "Reset to automatic" for a manual one), and
 * the marker shown next to a manual category.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, RotateCcw, Tags } from "lucide-react";
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
import { CategoryOverrideDialog } from "./CategoryOverrideDialog";

interface CategoryOverrideMenuProps {
  item: CategoryOverrideItem;
  name: string;
  category?: string;
  subcategory?: string;
  isManual: boolean;
  className?: string;
}

export function CategoryOverrideMenu({
  item,
  name,
  category,
  subcategory,
  isManual,
  className,
}: CategoryOverrideMenuProps) {
  const t = useTranslations("categories.override");
  const [open, setOpen] = useState(false);
  const { reset, isPending } = useCategoryOverride();

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
            <Tags className="mr-2 h-4 w-4" />
            {t("action")}
          </DropdownMenuItem>
          {isManual && (
            <DropdownMenuItem onSelect={handleReset} disabled={isPending}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t("reset")}
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
