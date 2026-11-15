"use client";

/**
 * GoalPurchaseDialog
 *
 * Marks a goal bought at the price actually paid (convex/goals.ts buy).
 * Before confirming, it shows whether the rule is met at that price and
 * what the purchase uses from each pool (goals.purchasePreview); a goal
 * bought before it is earned leaves its shortfall as debt.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
  useBuyGoal,
  usePurchasePreview,
  type GoalView,
  type TrackerView,
} from "@/hooks/convex/goals";
import { useErrorMessage } from "@/i18n/errors";
import { formatCurrency } from "@/lib/utils/currency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { parseTypedAmount, typedAmountText } from "@/../services/i18n/typedAmount";
import { goalCurrency } from "@/components/atomic/molecules/strategies/GoalCard";

interface GoalPurchaseDialogProps {
  goal: GoalView | null;
  trackers: readonly TrackerView[];
  currency: InvestmentCurrency;
  onOpenChange: (open: boolean) => void;
}

export function GoalPurchaseDialog(props: GoalPurchaseDialogProps) {
  return (
    <Dialog open={props.goal !== null} onOpenChange={props.onOpenChange}>
      {props.goal && <PurchaseForm {...props} goal={props.goal} />}
    </Dialog>
  );
}

/** A pool's name: money invested, gains, or a tracker. */
export function useMetricName(trackers: readonly TrackerView[]) {
  const t = useTranslations("strategies.goals.pools");
  return (metric: string) =>
    metric === "invested" || metric === "gains"
      ? t(metric)
      : (trackers.find((x) => `counter:${x._id}` === metric)?.name ?? t("tracker"));
}

function PurchaseForm({ goal, trackers, currency, onOpenChange }: GoalPurchaseDialogProps & { goal: GoalView }) {
  const t = useTranslations("strategies.goals.purchase");
  const tActions = useTranslations("common.actions");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const buy = useBuyGoal();
  const metricName = useMetricName(trackers);
  const [price, setPrice] = useState(typedAmountText(goal.price, locale));
  const [saving, setSaving] = useState(false);
  const typed = parseTypedAmount(price, locale);
  const parsed = typed !== undefined && Number.isFinite(typed) && typed > 0 ? typed : null;
  // Preview the price once typing pauses: each new price is a full evaluation
  const [settled, setSettled] = useState(parsed);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(parsed), 400);
    return () => clearTimeout(timer);
  }, [parsed]);
  const preview = usePurchasePreview(goal._id, settled);

  const amount = (metric: string, value: number) =>
    metric === "invested" || metric === "gains"
      ? formatCurrency(value, currency, { fractionDigits: 0 })
      : String(value);

  const submit = async () => {
    if (parsed === null) return;
    setSaving(true);
    try {
      const { earned } = await buy({ goalId: goal._id, price: parsed });
      toast.success(t(earned ? "toastEarned" : "toastEarly", { name: goal.name }));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t("title", { name: goal.name })}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="goal-paid">{t("pricePaid", { currency: goal.currency })}</Label>
          <Input id="goal-paid" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        {parsed !== null && (preview === undefined || settled !== parsed) ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : preview ? (
          <div className="space-y-2 text-sm">
            <p className={preview.earned ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400"}>
              {t(preview.earned ? "earned" : "early", {
                price: formatCurrency(settled ?? 0, goalCurrency(goal.currency)),
              })}
            </p>
            {preview.charges.length > 0 && (
              <ul className="space-y-1">
                {preview.charges.map((c) => (
                  <li key={c.metric} className="flex justify-between gap-4">
                    <span>{metricName(c.metric)}</span>
                    <span className="tabular-nums">{amount(c.metric, c.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          {tActions("cancel")}
        </Button>
        <Button
          onClick={() => void submit()}
          disabled={saving || parsed === null}
          variant={preview && !preview.earned ? "destructive" : "default"}
        >
          {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {t(preview && !preview.earned ? "confirmEarly" : "confirm")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
