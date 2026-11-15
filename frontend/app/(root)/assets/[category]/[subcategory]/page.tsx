"use client";

/**
 * The one page of every subcategory that takes manual assets (art, wine,
 * residential property, private equity, ...): its name and description,
 * "Add asset" preset to it, and its positions from the shared loader,
 * manual assets and provider positions alike. Which subcategories it serves
 * is services/portfolio/manualAssets.ts MANUAL_ASSET_SUBCATEGORIES, linked
 * from lib/config/categoryUI.tsx; any other path is a 404. Precious metals
 * keep their own vertical (assets/commodities/metals).
 */

import { useState } from "react";
import { notFound, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import {
  PageHeader,
  UnifiedPositionsTable,
} from "@/components/atomic/molecules/investments";
import { ManualAssetDialog } from "@/components/atomic/molecules/manualAssets";
import {
  isInvestmentCategory,
  subcategoryLabel,
  useCategoryLabels,
} from "@/lib/config/categoryUI";
import {
  isManualAssetCategory,
  isManualAssetSubcategory,
} from "@/../services/portfolio/manualAssets";

export default function ManualAssetSubcategoryPage() {
  const params = useParams<{ category: string; subcategory: string }>();
  const t = useTranslations("assets.manualAssets");
  const labels = useCategoryLabels();
  const [adding, setAdding] = useState(false);

  const { category, subcategory } = params;
  if (
    !isInvestmentCategory(category) ||
    !isManualAssetCategory(category) ||
    !isManualAssetSubcategory(category, subcategory)
  ) {
    notFound();
  }
  const label = subcategoryLabel(category, subcategory);
  if (!label) notFound();

  return (
    <div className="container mx-auto py-6 space-y-8">
      <PageHeader
        title={labels.name(label)}
        subtitle={labels.description(label)}
        actions={[
          {
            label: labels.categoryName(category),
            href: `/assets/${category}`,
            icon: ArrowLeft,
            variant: "outline",
          },
          { label: t("add"), onClick: () => setAdding(true) },
        ]}
      />

      <UnifiedPositionsTable
        category={category}
        subcategory={subcategory}
        emptyHint={t("emptyHint")}
      />

      <ManualAssetDialog
        open={adding}
        onOpenChange={setAdding}
        category={category}
        subcategory={subcategory}
      />
    </div>
  );
}
