"use client";

/**
 * ManualAssetDialog
 *
 * The one add/edit form for manual assets (convex/manualAssets.ts): the
 * category and subcategory, a name, the currency, dated valuations, an
 * optional purchase price and financing loan, and the details the
 * subcategory records (artist, vintage, reference number, ...). The input is
 * checked with the server's rules (services/portfolio/manualAssets.ts)
 * before it is sent.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useLoans } from "@/hooks/convex/loans";
import {
  useCreateManualAsset,
  useUpdateManualAsset,
} from "@/hooks/convex/manualAssets";
import { useErrorMessage } from "@/i18n/errors";
import { subcategoryLabel, useCategoryLabels } from "@/lib/config/categoryUI";
import { todayLocalISO } from "@/lib/utils/date";
import {
  attributesFor,
  MANUAL_ASSET_ATTRIBUTE_KINDS,
  MANUAL_ASSET_SUBCATEGORIES,
  parseTypedAmount,
  typedAmountText,
  validateManualAsset,
  type ManualAssetAttribute,
  type ManualAssetAttributes,
  type ManualAssetCategory,
} from "@/../services/portfolio/manualAssets";
import {
  BASE_CURRENCY,
  MIRRORED_CURRENCIES,
} from "@/../services/finance/currency";

const CATEGORIES = Object.keys(
  MANUAL_ASSET_SUBCATEGORIES,
) as ManualAssetCategory[];

/** The currencies offered: the base currency first, then every mirrored one. */
const CURRENCIES = [
  BASE_CURRENCY,
  ...MIRRORED_CURRENCIES.filter((c) => c !== BASE_CURRENCY),
];

const NO_LOAN = "none";

export interface ManualAssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The asset to edit; without one the dialog adds a new asset */
  asset?: Doc<"manualAssets">;
  /** Preselected for a new asset (the page it was opened from) */
  category?: ManualAssetCategory;
  subcategory?: string;
}

export function ManualAssetDialog(props: ManualAssetDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Remounted on every open, so the form starts from the asset */}
      {props.open && <ManualAssetForm {...props} />}
    </Dialog>
  );
}

/** One valuation row as typed: the amount stays text until it is sent. */
interface ValuationRow {
  key: number;
  date: string;
  value: string;
}

function firstSubcategory(category: ManualAssetCategory): string {
  return MANUAL_ASSET_SUBCATEGORIES[category][0];
}

function ManualAssetForm({
  onOpenChange,
  asset,
  category: presetCategory,
  subcategory: presetSubcategory,
}: ManualAssetDialogProps) {
  const t = useTranslations("assets.manualAssets");
  const tActions = useTranslations("common.actions");
  const tErrors = useTranslations("common.errors");
  const errorMessage = useErrorMessage();
  const labels = useCategoryLabels();
  const locale = useLocale();
  const loans = useLoans();
  const create = useCreateManualAsset();
  const update = useUpdateManualAsset();

  const initialCategory =
    CATEGORIES.find((c) => c === (asset?.category ?? presetCategory)) ??
    "collectibles";
  const [category, setCategory] = useState<ManualAssetCategory>(initialCategory);
  const [subcategory, setSubcategory] = useState<string>(() => {
    const wanted = asset?.subcategory ?? presetSubcategory;
    const slugs: readonly string[] = MANUAL_ASSET_SUBCATEGORIES[initialCategory];
    return wanted && slugs.includes(wanted)
      ? wanted
      : firstSubcategory(initialCategory);
  });
  const [name, setName] = useState(asset?.name ?? "");
  const [currency, setCurrency] = useState(asset?.currency ?? BASE_CURRENCY);
  const [rows, setRows] = useState<ValuationRow[]>(() =>
    asset && asset.valuations.length > 0
      ? asset.valuations.map((v, key) => ({
          key,
          date: v.date,
          value: typedAmountText(v.value, locale),
        }))
      : [{ key: 0, date: todayLocalISO(), value: "" }],
  );
  const [costBasis, setCostBasis] = useState(
    asset?.costBasis !== undefined ? typedAmountText(asset.costBasis, locale) : "",
  );
  const [linkedLoanId, setLinkedLoanId] = useState<string>(
    asset?.linkedLoanId ?? NO_LOAN,
  );
  const [attributes, setAttributes] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      Object.entries(asset?.attributes ?? {}).map(([k, v]) => [k, String(v)]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const handleCategory = (value: string) => {
    const next = CATEGORIES.find((c) => c === value);
    if (!next) return;
    setCategory(next);
    setSubcategory(firstSubcategory(next));
  };

  const subcategoryName = (slug: string) => {
    const label = subcategoryLabel(category, slug);
    return label ? labels.name(label) : slug;
  };

  const setRow = (key: number, patch: Partial<ValuationRow>) =>
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const addRow = () =>
    setRows((current) => [
      ...current,
      {
        key: Math.max(-1, ...current.map((r) => r.key)) + 1,
        date: todayLocalISO(),
        value: "",
      },
    ]);
  const removeRow = (key: number) =>
    setRows((current) => current.filter((r) => r.key !== key));

  /** The subcategory's attributes as typed values; blank ones left out. */
  const typedAttributes = (): ManualAssetAttributes => {
    const typed: Record<string, string | number> = {};
    for (const key of attributesFor(subcategory)) {
      const text = attributes[key]?.trim();
      if (!text) continue;
      typed[key] =
        MANUAL_ASSET_ATTRIBUTE_KINDS[key] === "year" ? Number(text) : text;
    }
    return typed as ManualAssetAttributes;
  };

  const handleSave = async () => {
    setError(null);
    const input = {
      category,
      subcategory,
      name,
      currency,
      valuations: rows.map((r) => ({
        date: r.date,
        value: parseTypedAmount(r.value, locale) ?? Number.NaN,
      })),
      costBasis: parseTypedAmount(costBasis, locale),
      linkedLoanId:
        linkedLoanId === NO_LOAN ? undefined : (linkedLoanId as Id<"loans">),
      attributes: typedAttributes(),
    };
    const invalid = validateManualAsset(input, Date.now());
    if (invalid) {
      setError(tErrors(invalid));
      return;
    }
    setIsPending(true);
    try {
      if (asset) {
        await update({ assetId: asset._id, ...input });
        toast.success(t("toast.updated", { name: input.name.trim() }));
      } else {
        await create(input);
        toast.success(t("toast.created", { name: input.name.trim() }));
      }
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "saveFailed"));
    } finally {
      setIsPending(false);
    }
  };

  const attributeFields = attributesFor(subcategory);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>
          {asset ? t("editTitle", { name: asset.name }) : t("addTitle")}
        </DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="manual-asset-category">{t("fields.category")}</Label>
            <Select value={category} onValueChange={handleCategory}>
              <SelectTrigger id="manual-asset-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {labels.categoryName(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-asset-subcategory">
              {t("fields.subcategory")}
            </Label>
            <Select value={subcategory} onValueChange={setSubcategory}>
              <SelectTrigger id="manual-asset-subcategory">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MANUAL_ASSET_SUBCATEGORIES[category].map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {subcategoryName(slug)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="manual-asset-name">{t("fields.name")}</Label>
          <Input
            id="manual-asset-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("fields.namePlaceholder")}
          />
        </div>

        {attributeFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {attributeFields.map((key: ManualAssetAttribute) => (
              <div key={key} className="grid gap-2">
                <Label htmlFor={`manual-asset-${key}`}>
                  {t(`attributes.${key}`)}
                </Label>
                <Input
                  id={`manual-asset-${key}`}
                  inputMode={
                    MANUAL_ASSET_ATTRIBUTE_KINDS[key] === "year"
                      ? "numeric"
                      : undefined
                  }
                  value={attributes[key] ?? ""}
                  onChange={(e) =>
                    setAttributes((a) => ({ ...a, [key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-2">
          <Label htmlFor="manual-asset-currency">{t("fields.currency")}</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger id="manual-asset-currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(asset && !CURRENCIES.includes(asset.currency)
                ? [asset.currency, ...CURRENCIES]
                : CURRENCIES
              ).map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-2">
          <Label>{t("fields.valuations")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("fields.valuationsHint")}
          </p>
          {rows.map((row) => (
            <div key={row.key} className="flex items-center gap-2">
              <Input
                type="date"
                aria-label={t("fields.date")}
                value={row.date}
                max={todayLocalISO()}
                onChange={(e) => setRow(row.key, { date: e.target.value })}
                className="w-40"
              />
              <Input
                inputMode="decimal"
                aria-label={t("fields.value")}
                placeholder={t("fields.value")}
                value={row.value}
                onChange={(e) => setRow(row.key, { value: e.target.value })}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("fields.removeValuation")}
                disabled={rows.length === 1}
                onClick={() => removeRow(row.key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={addRow}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("fields.addValuation")}
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-2">
            <Label htmlFor="manual-asset-cost">{t("fields.costBasis")}</Label>
            <Input
              id="manual-asset-cost"
              inputMode="decimal"
              value={costBasis}
              onChange={(e) => setCostBasis(e.target.value)}
              placeholder={t("fields.optional")}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="manual-asset-loan">{t("fields.linkedLoan")}</Label>
            <Select value={linkedLoanId} onValueChange={setLinkedLoanId}>
              <SelectTrigger id="manual-asset-loan">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_LOAN}>{t("fields.noLoan")}</SelectItem>
                {(loans ?? []).map((loan) => (
                  <SelectItem key={loan._id} value={loan._id}>
                    {loan.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("fields.costBasisHint")}
        </p>

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={isPending}
        >
          {tActions("cancel")}
        </Button>
        <Button type="button" onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {tActions("save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
