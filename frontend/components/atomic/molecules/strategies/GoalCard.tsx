"use client";

/**
 * GoalCard
 *
 * One goal on /strategies/goals: its price, status and overall progress,
 * and its rule as a tree of checks, each with where it stands against its
 * target (services/goals/evaluate.ts). Checklist steps can be ticked here.
 * Money checks arrive in the display currency (hooks/convex/goals.ts); the
 * price is shown in the goal's own currency.
 */

import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Archive, Check, Pencil, RotateCcw, ShoppingBag, Trash2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Checkbox } from "@/components/ui/shadcn/checkbox";
import {
  useSetChecklistItem,
  type GoalView,
  type TrackerView,
} from "@/hooks/convex/goals";
import { useErrorMessage } from "@/i18n/errors";
import { formatCurrency } from "@/lib/utils/currency";
import type { InvestmentCurrency } from "@/lib/types/investments";
import { cn } from "@/lib/utils";
import { isGroup, type RuleLeaf, type RuleNode } from "@/../services/goals/rules";
import type { LeafResult } from "@/../services/goals/evaluate";

interface GoalCardProps {
  goal: GoalView;
  trackers: readonly TrackerView[];
  /** Display currency of the money checks */
  currency: InvestmentCurrency;
  onEdit: () => void;
  onBuy: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

/** The goal's own currency, for formatCurrency. */
export function goalCurrency(code: string): InvestmentCurrency {
  return code.toLowerCase() as InvestmentCurrency;
}

export function GoalCard(props: GoalCardProps) {
  const { goal, currency } = props;
  const t = useTranslations("strategies.goals.card");
  const format = useFormatter();
  const evaluation = goal.evaluation;
  const status =
    goal.status === "bought"
      ? goal.purchase?.earned
        ? "bought"
        : "boughtEarly"
      : goal.status === "archived"
        ? "archived"
        : evaluation?.satisfied
          ? "eligible"
          : "active";
  const progress = evaluation?.progress ?? 0;
  const ruleChanges = goal.history.filter((h) => h.kind === "ruleChanged");

  return (
    <Card className={cn(goal.status !== "active" && "opacity-80")}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="truncate">{goal.name}</CardTitle>
            <Badge
              variant={status === "eligible" ? "default" : "outline"}
              className={cn(status === "boughtEarly" && "border-amber-500 text-amber-600")}
            >
              {t(`status.${status}`)}
            </Badge>
          </div>
          {goal.description && <CardDescription>{goal.description}</CardDescription>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {goal.status === "active" && (
            <>
              <Button size="sm" variant={status === "eligible" ? "default" : "outline"} onClick={props.onBuy}>
                <ShoppingBag className="me-1 h-4 w-4" />
                {t("buy")}
              </Button>
              <Button variant="ghost" size="icon" aria-label={t("edit")} onClick={props.onEdit}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" aria-label={t("archive")} onClick={props.onArchive}>
                <Archive className="h-4 w-4" />
              </Button>
            </>
          )}
          {goal.status === "archived" && (
            <Button variant="ghost" size="icon" aria-label={t("restore")} onClick={props.onRestore}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          {goal.status !== "bought" && (
            <Button variant="ghost" size="icon" aria-label={t("delete")} onClick={props.onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-6 text-sm">
          <div>
            <div className="text-muted-foreground">{t("price")}</div>
            <div className="text-lg font-semibold tabular-nums">
              {formatCurrency(goal.price, goalCurrency(goal.currency), { fractionDigits: 0 })}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">{t("started")}</div>
            <div className="text-lg font-semibold">
              {format.dateTime(new Date(`${goal.startDate}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" })}
            </div>
          </div>
          {goal.status === "active" && (
            <div className="min-w-40 flex-1">
              <div className="text-muted-foreground">
                {t("progress", { percent: format.number(progress, { style: "percent", maximumFractionDigits: 0 }) })}
              </div>
              <ProgressBar value={progress} done={status === "eligible"} />
            </div>
          )}
        </div>

        {goal.status === "bought" && goal.purchase && (
          <p className="text-sm">
            {t("boughtOn", {
              date: format.dateTime(new Date(`${goal.purchase.date}T00:00:00Z`), {
                dateStyle: "medium",
                timeZone: "UTC",
              }),
              price: formatCurrency(goal.purchase.price, goalCurrency(goal.currency)),
            })}
            {!goal.purchase.earned && <span className="text-amber-600"> {t("boughtEarlyHint")}</span>}
          </p>
        )}

        {evaluation && goal.status !== "bought" ? (
          <RuleTree
            node={goal.rule}
            path=""
            goal={goal}
            leaves={new Map(evaluation.leaves.map((l) => [l.path, l]))}
            trackers={props.trackers}
            currency={currency}
          />
        ) : null}

        {ruleChanges.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {t("ruleChanges", {
              count: ruleChanges.length,
              date: format.dateTime(new Date(ruleChanges[ruleChanges.length - 1].at), { dateStyle: "medium" }),
            })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ProgressBar({ value, done }: { value: number; done?: boolean }) {
  return (
    <div className="mt-2 h-2 w-full rounded-full bg-muted" aria-hidden>
      <div
        className={cn("h-full rounded-full", done ? "bg-emerald-500" : "bg-primary")}
        style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
      />
    </div>
  );
}

interface TreeProps {
  node: RuleNode;
  path: string;
  goal: GoalView;
  leaves: ReadonlyMap<string, LeafResult>;
  trackers: readonly TrackerView[];
  currency: InvestmentCurrency;
}

/** A rule's groups as headed, indented lists, its checks as rows. */
function RuleTree(props: TreeProps) {
  const t = useTranslations("strategies.goals.rule");
  const { node, path } = props;
  if (!isGroup(node)) return <LeafRow {...props} leaf={node} />;
  return (
    <div className={cn("space-y-2", path !== "" && "border-s ps-3")}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {node.kind === "atLeast" ? t("atLeast", { count: node.count }) : t(node.kind)}
      </div>
      {node.children.map((child, i) => (
        <RuleTree key={i} {...props} node={child} path={path === "" ? String(i) : `${path}.${i}`} />
      ))}
    </div>
  );
}

/** One check: what it asks, where it stands, and a bar. */
function LeafRow(props: TreeProps & { leaf: RuleLeaf }) {
  const { leaf, goal, currency } = props;
  const t = useTranslations("strategies.goals.rule");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const setItem = useSetChecklistItem();
  const result = props.leaves.get(props.path);
  const tracker = (id: string) => props.trackers.find((x) => x._id === id);
  const trackerName = (id: string) => tracker(id)?.name ?? t("unknownTracker");
  const unit = (id: string) => tracker(id)?.unit ?? "";
  const money = (v: number) => formatCurrency(v, currency, { fractionDigits: 0 });
  const num = (v: number) => format.number(v, { maximumFractionDigits: 2 });

  const label = (() => {
    switch (leaf.kind) {
      case "invested":
      case "gains":
        return leaf.target.kind === "priceMultiple"
          ? t(`${leaf.kind}.multiple`, { multiple: num(leaf.target.multiple) })
          : t(`${leaf.kind}.amount`, {
              amount: formatCurrency(leaf.target.amount, goalCurrency(goal.currency), { fractionDigits: 0 }),
            });
      case "netWorth":
        return t("netWorth", {
          amount: formatCurrency(leaf.amount, goalCurrency(goal.currency), { fractionDigits: 0 }),
        });
      case "cooldown":
        return t("cooldown", { days: leaf.days });
      case "counter":
        return t("counter", { tracker: trackerName(leaf.trackerId), count: num(leaf.count) });
      case "streak":
        return t(`streak.${leaf.period}`, {
          tracker: trackerName(leaf.trackerId),
          perPeriod: num(leaf.perPeriod),
          periods: leaf.periods,
        });
      case "checklist":
        return t("checklist");
      case "measurement":
        return t(`measurement.${leaf.basis}.${leaf.comparison}`, {
          tracker: trackerName(leaf.trackerId),
          value: num(leaf.value),
          unit: unit(leaf.trackerId),
        });
    }
  })();

  const standing = result
    ? result.unit === "money"
      ? t("standing", { current: money(result.current), target: money(result.target) })
      : t("standing", { current: num(result.current), target: num(result.target) })
    : null;

  const toggle = async (itemId: string, done: boolean) => {
    try {
      await setItem({ goalId: goal._id, checklistItemId: itemId, done });
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-start justify-between gap-3 text-sm">
        <span className="flex items-center gap-1.5">
          {result?.satisfied && <Check className="h-4 w-4 shrink-0 text-emerald-600" />}
          <span>{label}</span>
          {result?.consumable && (
            <span className="text-xs text-muted-foreground">{t("consumed")}</span>
          )}
        </span>
        {standing && leaf.kind !== "checklist" && (
          <span className="shrink-0 tabular-nums text-muted-foreground">{standing}</span>
        )}
      </div>
      {leaf.kind === "checklist" ? (
        <ul className="space-y-1 ps-1">
          {leaf.items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                id={`${goal._id}-${item.id}`}
                checked={goal.checklistDone.includes(item.id)}
                disabled={goal.status !== "active"}
                onCheckedChange={(v) => void toggle(item.id, v === true)}
              />
              <label htmlFor={`${goal._id}-${item.id}`}>{item.label}</label>
            </li>
          ))}
        </ul>
      ) : (
        result && <ProgressBar value={result.progress} done={result.satisfied} />
      )}
    </div>
  );
}
