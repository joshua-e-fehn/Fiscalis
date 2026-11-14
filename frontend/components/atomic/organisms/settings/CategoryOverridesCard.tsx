"use client";

/**
 * CategoryOverridesCard
 *
 * Every account and holding the user filed under a category themselves
 * (classification.getOverriddenItems), with the category the rule engine
 * would use, and the actions to change or reset each one.
 */

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import { useOverriddenItems } from "@/hooks/convex/classification";
import { CategoryOverrideMenu } from "@/components/atomic/molecules/classification";
import {
  isInvestmentCategory,
  subcategoryLabel,
  useCategoryLabels,
} from "@/lib/config/categoryUI";

export function CategoryOverridesCard() {
  const t = useTranslations("categories.override.list");
  const labels = useCategoryLabels();
  const items = useOverriddenItems();

  /** "Equities · ETFs"; an unknown slug as stored */
  const classificationName = (category?: string, subcategory?: string) => {
    if (!category) return "—";
    const name = labels.categoryNameOf(category);
    const label =
      subcategory && isInvestmentCategory(category)
        ? subcategoryLabel(category, subcategory)
        : null;
    const sub = label ? labels.name(label) : subcategory;
    return sub ? `${name} · ${sub}` : name;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("cardTitle")}</CardTitle>
        {items && items.length > 0 && (
          <CardDescription>{t("count", { count: items.length })}</CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {items === undefined ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !items || items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.name")}</TableHead>
                <TableHead>{t("columns.source")}</TableHead>
                <TableHead>{t("columns.category")}</TableHead>
                <TableHead>{t("columns.automatic")}</TableHead>
                <TableHead className="w-[40px]">
                  <span className="sr-only">{t("edit")}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.target}-${item.id}`}>
                  <TableCell>
                    <div className="font-medium">{item.name}</div>
                    {item.symbol && item.symbol !== item.name && (
                      <div className="text-xs text-muted-foreground">
                        {item.symbol}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>{t(`sources.${item.target}`)}</TableCell>
                  <TableCell>
                    {classificationName(item.category, item.subcategory)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {classificationName(
                      item.autoCategory,
                      item.autoSubcategory,
                    )}
                  </TableCell>
                  <TableCell className="p-1">
                    <CategoryOverrideMenu
                      item={{ target: item.target, id: item.id }}
                      name={item.name}
                      category={item.category}
                      subcategory={item.subcategory}
                      isManual
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
