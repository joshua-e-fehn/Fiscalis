"use client";

import { useTranslations } from "next-intl";
import {
  useCategoryLabels,
  type SubcategoryLabel,
} from "@/lib/config/categoryUI";
import type {
  InvestmentCategory,
  SubcategoryByCategory,
} from "@/lib/types/classification";

interface ComingSoonPageProps<C extends InvestmentCategory> {
  category: C;
  subcategory: SubcategoryByCategory[C];
  /** The subcategory's overview (default) or its holdings list */
  view?: "overview" | "inventory";
}

/**
 * Placeholder for a subcategory page that is not built yet: the
 * subcategory's name and description in the user's language and a
 * "coming soon" line. Shared by the collectibles and commodities stubs.
 */
export function ComingSoonPage<C extends InvestmentCategory>({
  category,
  subcategory,
  view = "overview",
}: ComingSoonPageProps<C>) {
  const t = useTranslations("assets.comingSoon");
  const labels = useCategoryLabels();
  const label = `${category}.subcategories.${subcategory}` as SubcategoryLabel;
  const name = labels.name(label);

  return (
    <div className="container mx-auto py-6">
      <h1 className="text-3xl font-bold mb-6">
        {view === "inventory" ? t("inventoryTitle", { name }) : name}
      </h1>
      <p className="text-muted-foreground">{labels.description(label)}</p>
      <p className="text-muted-foreground mt-2">{t("notice")}</p>
    </div>
  );
}
