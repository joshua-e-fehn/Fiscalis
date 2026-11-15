"use client";

/**
 * PieEditorDialog
 *
 * The one add/edit form for pies (convex/pies.ts): a name, an optional
 * description and the slices, each a category (optionally one subcategory)
 * or specific holdings, with a target weight. The weights must sum to 100%;
 * the input is checked with the server's rules (services/portfolio/pies.ts)
 * before it is sent.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Scale, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Textarea } from "@/components/ui/shadcn/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import type { Id } from "@/convex/_generated/dataModel";
import {
  useCreatePie,
  usePieHoldings,
  useUpdatePie,
} from "@/hooks/convex/pies";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import { useErrorMessage } from "@/i18n/errors";
import { subcategoryLabel, useCategoryLabels } from "@/lib/config/categoryUI";
import {
  subcategoriesByCategory,
  type InvestmentCategory,
} from "@/lib/types/classification";
import { formatCurrency } from "@/lib/utils/currency";
import {
  parseTypedAmount,
  typedAmountText,
} from "@/../services/i18n/typedAmount";
import {
  evenWeights,
  PIE_CATEGORIES,
  PIE_WEIGHT_TOLERANCE,
  totalWeight,
  validatePie,
  type PieCategory,
  type PieInput,
  type PieSlice,
} from "@/../services/portfolio/pies";

/** The pie being edited: its id and stored fields. */
export interface EditablePie {
  _id: Id<"pies">;
  name: string;
  description?: string;
  slices: PieSlice[];
}

export interface PieEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The pie to edit; without one the dialog creates a new pie */
  pie?: EditablePie;
}

export function PieEditorDialog(props: PieEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Remounted on every open, so the form starts from the pie */}
      {props.open && <PieEditorForm {...props} />}
    </Dialog>
  );
}

/** "All subcategories" in the subcategory select. */
const ALL = "all";

/** One slice as typed: the weight stays text until it is sent. */
interface SliceRow {
  key: number;
  kind: "category" | "holdings";
  category: PieCategory;
  /** A subcategory slug, or ALL */
  subcategory: string;
  holdingKeys: string[];
  label: string;
  weight: string;
}

function subcategoriesOf(category: PieCategory): readonly string[] {
  return category === "unclassified"
    ? []
    : subcategoriesByCategory[category as InvestmentCategory];
}

function toRow(slice: PieSlice, key: number, locale: string): SliceRow {
  const { target } = slice;
  const category =
    target.kind === "category"
      ? (PIE_CATEGORIES.find((c) => c === target.category) ?? "equities")
      : "equities";
  return {
    key,
    kind: target.kind,
    category,
    subcategory:
      target.kind === "category" ? (target.subcategory ?? ALL) : ALL,
    holdingKeys: target.kind === "holdings" ? target.holdingKeys : [],
    label: slice.label ?? "",
    weight: typedAmountText(slice.weight, locale),
  };
}

function emptyRow(key: number, category: PieCategory, weight = ""): SliceRow {
  return {
    key,
    kind: "category",
    category,
    subcategory: ALL,
    holdingKeys: [],
    label: "",
    weight,
  };
}

function PieEditorForm({ onOpenChange, pie }: PieEditorDialogProps) {
  const t = useTranslations("strategies.pies.editor");
  const tToast = useTranslations("strategies.pies.toast");
  const tActions = useTranslations("common.actions");
  const tErrors = useTranslations("common.errors");
  const errorMessage = useErrorMessage();
  const labels = useCategoryLabels();
  const locale = useLocale();
  const { fromEur, currency } = useDisplayCurrency();
  const holdings = usePieHoldings();
  const create = useCreatePie();
  const update = useUpdatePie();

  const [name, setName] = useState(pie?.name ?? "");
  const [description, setDescription] = useState(pie?.description ?? "");
  const [rows, setRows] = useState<SliceRow[]>(() =>
    pie
      ? pie.slices.map((slice, i) => toRow(slice, i, locale))
      : [emptyRow(0, "equities", "100")],
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const setRow = (key: number, patch: Partial<SliceRow>) =>
    setRows((current) =>
      current.map((r) => (r.key === key ? { ...r, ...patch } : r)),
    );
  const addRow = () =>
    setRows((current) => {
      const used = new Set(current.map((r) => r.category));
      const next = PIE_CATEGORIES.find((c) => !used.has(c)) ?? "equities";
      return [...current, emptyRow(Math.max(-1, ...current.map((r) => r.key)) + 1, next)];
    });
  const removeRow = (key: number) =>
    setRows((current) => current.filter((r) => r.key !== key));
  const splitEvenly = () =>
    setRows((current) => {
      const weights = evenWeights(current.length);
      return current.map((r, i) => ({ ...r, weight: typedAmountText(weights[i], locale) }));
    });
  const toggleHolding = (row: SliceRow, holdingKey: string, checked: boolean) =>
    setRow(row.key, {
      holdingKeys: checked
        ? [...row.holdingKeys, holdingKey]
        : row.holdingKeys.filter((k) => k !== holdingKey),
    });

  const slices: PieSlice[] = rows.map((r) => ({
    label: r.label,
    weight: parseTypedAmount(r.weight, locale) ?? Number.NaN,
    target:
      r.kind === "category"
        ? {
            kind: "category",
            category: r.category,
            ...(r.subcategory !== ALL ? { subcategory: r.subcategory } : {}),
          }
        : { kind: "holdings", holdingKeys: r.holdingKeys },
  }));
  const total = totalWeight(
    slices.map((s) => ({ weight: Number.isFinite(s.weight) ? s.weight : 0 })),
  );
  const totalLabel = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(total);

  const subcategoryName = (category: PieCategory, slug: string) => {
    const label =
      category === "unclassified"
        ? null
        : subcategoryLabel(category as InvestmentCategory, slug);
    return label ? labels.name(label) : slug;
  };

  const handleSave = async () => {
    setError(null);
    const input: PieInput = { name, description, slices };
    const invalid = validatePie(input);
    if (invalid) {
      setError(tErrors(invalid));
      return;
    }
    setIsPending(true);
    try {
      if (pie) {
        await update({ pieId: pie._id, ...input });
        toast.success(tToast("updated", { name: name.trim() }));
      } else {
        await create(input);
        toast.success(tToast("created", { name: name.trim() }));
      }
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e, "saveFailed"));
    } finally {
      setIsPending(false);
    }
  };

  const heldKeys = new Set((holdings ?? []).map((h) => h.key));

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>
          {pie ? t("editTitle", { name: pie.name }) : t("addTitle")}
        </DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="pie-name">{t("name")}</Label>
          <Input
            id="pie-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("namePlaceholder")}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="pie-description">{t("descriptionLabel")}</Label>
          <Textarea
            id="pie-description"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("optional")}
          />
        </div>

        <div className="flex items-center justify-between">
          <Label>{t("slices")}</Label>
          <Button type="button" variant="ghost" size="sm" onClick={splitEvenly}>
            <Scale className="mr-2 h-4 w-4" />
            {t("splitEvenly")}
          </Button>
        </div>

        {rows.map((row, index) => (
          <div key={row.key} className="grid gap-3 rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                {t("slice", { number: index + 1 })}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("removeSlice")}
                disabled={rows.length === 1}
                onClick={() => removeRow(row.key)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label htmlFor={`pie-kind-${row.key}`}>{t("kind")}</Label>
                <Select
                  value={row.kind}
                  onValueChange={(kind) =>
                    setRow(row.key, { kind: kind as SliceRow["kind"] })
                  }
                >
                  <SelectTrigger id={`pie-kind-${row.key}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">{t("kinds.category")}</SelectItem>
                    <SelectItem value="holdings">{t("kinds.holdings")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`pie-label-${row.key}`}>{t("label")}</Label>
                <Input
                  id={`pie-label-${row.key}`}
                  value={row.label}
                  onChange={(e) => setRow(row.key, { label: e.target.value })}
                  placeholder={t("optional")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`pie-weight-${row.key}`}>{t("weight")}</Label>
                <Input
                  id={`pie-weight-${row.key}`}
                  inputMode="decimal"
                  value={row.weight}
                  onChange={(e) => setRow(row.key, { weight: e.target.value })}
                />
              </div>
            </div>

            {row.kind === "category" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`pie-category-${row.key}`}>{t("category")}</Label>
                  <Select
                    value={row.category}
                    onValueChange={(value) => {
                      const category = PIE_CATEGORIES.find((c) => c === value);
                      if (category) setRow(row.key, { category, subcategory: ALL });
                    }}
                  >
                    <SelectTrigger id={`pie-category-${row.key}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PIE_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {labels.categoryNameOf(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`pie-subcategory-${row.key}`}>
                    {t("subcategory")}
                  </Label>
                  <Select
                    value={row.subcategory}
                    onValueChange={(subcategory) => setRow(row.key, { subcategory })}
                    disabled={subcategoriesOf(row.category).length === 0}
                  >
                    <SelectTrigger id={`pie-subcategory-${row.key}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>{t("allSubcategories")}</SelectItem>
                      {subcategoriesOf(row.category).map((slug) => (
                        <SelectItem key={slug} value={slug}>
                          {subcategoryName(row.category, slug)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : (
              <div className="grid gap-2">
                <Label>{t("holdings")}</Label>
                {holdings === undefined ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : holdings.length === 0 && row.holdingKeys.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t("noHoldings")}</p>
                ) : (
                  <div className="grid max-h-48 gap-1 overflow-y-auto rounded-md border p-2">
                    {row.holdingKeys
                      .filter((k) => !heldKeys.has(k))
                      .map((k) => (
                        <label key={k} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked
                            onCheckedChange={() => toggleHolding(row, k, false)}
                          />
                          <span className="truncate text-muted-foreground">
                            {t("holdingGone")}
                          </span>
                        </label>
                      ))}
                    {holdings.map((h) => (
                      <label
                        key={h.key}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Checkbox
                            checked={row.holdingKeys.includes(h.key)}
                            onCheckedChange={(checked) =>
                              toggleHolding(row, h.key, checked === true)
                            }
                          />
                          <span className="truncate">{h.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {labels.categoryNameOf(h.category)}
                          </span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {formatCurrency(fromEur(h.value), currency, { fractionDigits: 0 })}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <div className="flex items-center justify-between">
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="mr-2 h-4 w-4" />
            {t("addSlice")}
          </Button>
          <span
            className={
              Math.abs(total - 100) <= PIE_WEIGHT_TOLERANCE
                ? "text-sm text-muted-foreground"
                : "text-sm text-destructive"
            }
          >
            {Math.abs(total - 100) <= PIE_WEIGHT_TOLERANCE
              ? t("total", { total: totalLabel })
              : t("totalOff", { total: totalLabel })}
          </span>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
          {tActions("cancel")}
        </Button>
        <Button onClick={handleSave} disabled={isPending}>
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {tActions("save")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
