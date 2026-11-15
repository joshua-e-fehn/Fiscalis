"use client";

/**
 * ValuationOverrideDialog
 *
 * Values one broker position or Bitpanda holding by the user's own price
 * (ENG-239, services/pricing/valuationOverride.ts): a manual price per unit
 * as of a date, or a mark-to-model that grows a start price at a fixed
 * annual rate. The quantity still follows the provider. An existing
 * override can be removed here, so the provider price applies again.
 */

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  useClearValuationOverride,
  useSetValuationOverride,
  type ValuationHoldingRef,
} from "@/hooks/convex/valuationOverrides";
import { useErrorMessage } from "@/i18n/errors";
import { formatCurrency } from "@/lib/utils/currency";
import { todayLocalISO } from "@/lib/utils/date";
import {
  parseTypedAmount,
  typedAmountText,
} from "@/../services/i18n/typedAmount";
import {
  BASE_CURRENCY,
  MIRRORED_CURRENCIES,
  normalizeCurrency,
} from "@/../services/finance/currency";
import {
  VALUATION_OVERRIDE_KINDS,
  overridePricePerUnit,
  validateValuationOverride,
  type ValuationOverride,
  type ValuationOverrideKind,
} from "@/../services/pricing/valuationOverride";

/** The currencies offered: the base currency first, then every mirrored one. */
const CURRENCIES = [
  BASE_CURRENCY,
  ...MIRRORED_CURRENCIES.filter((c) => c !== BASE_CURRENCY),
];

export interface ValuationOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: ValuationHoldingRef;
  /** The holding's name, shown in the description */
  name: string;
  /** Synced quantity, for the preview */
  quantity: number;
  /** The provider's price per unit and its currency, to start a new override from */
  providerPrice?: number;
  providerCurrency: string;
  /** The stored override, when the holding has one */
  override?: ValuationOverride;
}

export function ValuationOverrideDialog(props: ValuationOverrideDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Remounted on every open, so the form starts from the holding */}
      {props.open && <ValuationOverrideForm {...props} />}
    </Dialog>
  );
}

/**
 * The provider's price in a currency the form offers, in major units
 * ("GBp" pence become GBP pounds), or null when its currency is not offered
 * and the price would be mislabelled as another currency.
 */
function providerStart(
  price: number | undefined,
  currency: string,
): { price?: number; currency: string } | null {
  const normalized = normalizeCurrency(currency);
  if (!normalized || !CURRENCIES.includes(normalized.code)) return null;
  return {
    price: price === undefined ? undefined : price / normalized.divisor,
    currency: normalized.code,
  };
}

function ValuationOverrideForm({
  onOpenChange,
  holding,
  name,
  quantity,
  providerPrice,
  providerCurrency,
  override,
}: ValuationOverrideDialogProps) {
  const t = useTranslations("categories.valuation");
  const tActions = useTranslations("common.actions");
  const tErrors = useTranslations("common.errors");
  const errorMessage = useErrorMessage();
  const locale = useLocale();
  const setOverride = useSetValuationOverride();
  const clearOverride = useClearValuationOverride();

  const provider = providerStart(providerPrice, providerCurrency);
  const [kind, setKind] = useState<ValuationOverrideKind>(
    override?.kind ?? "manualPrice",
  );
  const [price, setPrice] = useState(() =>
    typedAmountText(override?.pricePerUnit ?? provider?.price ?? Number.NaN, locale),
  );
  const [currency, setCurrency] = useState(
    override?.currency ?? provider?.currency ?? BASE_CURRENCY,
  );
  const [asOf, setAsOf] = useState(override?.asOf ?? todayLocalISO());
  const [rate, setRate] = useState(() =>
    typedAmountText(override?.annualRatePercent ?? 0, locale),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const input: ValuationOverride = {
    kind,
    pricePerUnit: parseTypedAmount(price, locale) ?? Number.NaN,
    currency,
    asOf,
    ...(kind === "markToModel"
      ? { annualRatePercent: parseTypedAmount(rate, locale) ?? Number.NaN }
      : {}),
  };
  const invalid = validateValuationOverride(input, Date.now());
  const todayPrice = invalid ? null : overridePricePerUnit(input, Date.now());

  const handleSave = async () => {
    setError(null);
    if (invalid) {
      setError(tErrors(invalid));
      return;
    }
    setIsPending(true);
    try {
      await setOverride({ holding, ...input });
      toast.success(t("toast.saved", { name }));
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsPending(false);
    }
  };

  const handleReset = async () => {
    setError(null);
    setIsPending(true);
    try {
      await clearOverride({ holding });
      toast.success(t("toast.reset", { name }));
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setIsPending(false);
    }
  };

  const isModel = kind === "markToModel";

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t("dialog.title")}</DialogTitle>
        <DialogDescription>{t("dialog.description", { name })}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="valuation-kind">{t("dialog.kind")}</Label>
          <Select
            value={kind}
            onValueChange={(value) => {
              const next = VALUATION_OVERRIDE_KINDS.find((k) => k === value);
              if (next) setKind(next);
            }}
          >
            <SelectTrigger id="valuation-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VALUATION_OVERRIDE_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`kinds.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t(`kindHints.${kind}`)}</p>
        </div>

        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <div className="grid gap-2">
            <Label htmlFor="valuation-price">
              {isModel ? t("dialog.modelPrice") : t("dialog.price")}
            </Label>
            <Input
              id="valuation-price"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="valuation-currency">{t("dialog.currency")}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger id="valuation-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className={isModel ? "grid grid-cols-2 gap-3" : "grid gap-3"}>
          <div className="grid gap-2">
            <Label htmlFor="valuation-date">
              {isModel ? t("dialog.modelDate") : t("dialog.date")}
            </Label>
            <Input
              id="valuation-date"
              type="date"
              max={todayLocalISO()}
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
            />
          </div>
          {isModel && (
            <div className="grid gap-2">
              <Label htmlFor="valuation-rate">{t("dialog.rate")}</Label>
              <Input
                id="valuation-rate"
                inputMode="decimal"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          )}
        </div>
        {isModel && (
          <p className="-mt-2 text-xs text-muted-foreground">{t("dialog.rateHint")}</p>
        )}

        {todayPrice !== null && (
          <p className="text-sm text-muted-foreground">
            {t("dialog.preview", {
              price: formatCurrency(todayPrice, currency),
              value: formatCurrency(todayPrice * quantity, currency),
            })}
          </p>
        )}

        {error && (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        )}
      </div>

      <DialogFooter className="gap-2 sm:justify-between">
        {override ? (
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
          <Button type="button" onClick={handleSave} disabled={isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {tActions("save")}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  );
}
