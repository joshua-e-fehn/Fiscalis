"use client";

/**
 * GoalEditorDialog
 *
 * The one add/edit form for goals (convex/goals.ts): a name, an optional
 * description, a price in one of the display currencies, and the rule. The
 * builder edits a rule of one group (all / any / at least n) over a list of
 * checks; a deeper rule (written elsewhere, e.g. by the AI assistant) is
 * kept as it is unless the user starts over. The input is checked with the
 * server's rules (services/goals/input.ts) before it is sent.
 *
 * The assistant (convex/goalsAi.ts) writes a rule from the user's own
 * words; the user reads its summary and applies it to the builder, which
 * creates any trackers it needs. Hidden when the deployment has no model.
 */

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
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
  useCreateGoal,
  useCreateTracker,
  useUpdateGoal,
  useUtcToday,
  type TrackerView,
} from "@/hooks/convex/goals";
import { toActionError } from "@/lib/actionError";
import { withCreatedTrackers, type RuleDraft } from "@/../services/goals/aiRule";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import { useErrorMessage, type ErrorCode } from "@/i18n/errors";
import { parseTypedAmount, typedAmountText } from "@/../services/i18n/typedAmount";
import { DISPLAY_CURRENCIES } from "@/../services/finance/displayCurrency";
import { normalizeGoal } from "@/../services/goals/input";
import {
  isGroup,
  RULE_LEAF_KINDS,
  type RuleLeaf,
  type RuleLeafKind,
  type RuleNode,
} from "@/../services/goals/rules";

/** The goal being edited: its id and stored fields. */
export interface EditableGoal {
  _id: Id<"goals">;
  name: string;
  description?: string;
  currency: string;
  price: number;
  rule: RuleNode;
}

export interface GoalEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The goal to edit; without one the dialog creates a new goal */
  goal?: EditableGoal;
  trackers: readonly TrackerView[];
  /** Until when (ms) a new goal may be backdated (the launch import) */
  backdateUntil?: number;
}

export function GoalEditorDialog(props: GoalEditorDialogProps) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      {/* Remounted on every open, so the form starts from the goal */}
      {props.open && <GoalEditorForm {...props} />}
    </Dialog>
  );
}

type Combinator = "all" | "any" | "atLeast";

/** One check as typed: numbers stay text until the goal is sent. */
interface Row {
  key: number;
  kind: RuleLeafKind;
  targetMode: "priceMultiple" | "amount";
  number: string;
  trackerId: string;
  perPeriod: string;
  period: "week" | "month";
  comparison: "atLeast" | "atMost";
  basis: "latest" | "best";
  items: { id: string; label: string }[];
}

let nextKey = 1;

/** A checklist step id unique across page loads (ids are stored with the rule). */
function newStepId(): string {
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function blankRow(kind: RuleLeafKind, trackers: readonly TrackerView[]): Row {
  const counts = trackers.filter((t) => t.kind === "count");
  const measures = trackers.filter((t) => t.kind === "measurement");
  const defaults: Partial<Record<RuleLeafKind, string>> = {
    invested: "10",
    gains: "1",
    cooldown: "30",
    counter: "10",
    streak: "12",
  };
  return {
    key: nextKey++,
    kind,
    targetMode: "priceMultiple",
    number: defaults[kind] ?? "",
    trackerId: (kind === "measurement" ? measures : counts)[0]?._id ?? "",
    perPeriod: "3",
    period: "week",
    comparison: "atLeast",
    basis: "best",
    items: kind === "checklist" ? [{ id: newStepId(), label: "" }] : [],
  };
}

function toRow(leaf: RuleLeaf, locale: string): Row {
  const row = blankRow(leaf.kind, []);
  const text = (n: number) => typedAmountText(n, locale);
  switch (leaf.kind) {
    case "invested":
    case "gains":
      row.targetMode = leaf.target.kind;
      row.number = text(leaf.target.kind === "priceMultiple" ? leaf.target.multiple : leaf.target.amount);
      break;
    case "netWorth":
      row.number = text(leaf.amount);
      break;
    case "cooldown":
      row.number = text(leaf.days);
      break;
    case "counter":
      row.trackerId = leaf.trackerId;
      row.number = text(leaf.count);
      break;
    case "streak":
      row.trackerId = leaf.trackerId;
      row.perPeriod = text(leaf.perPeriod);
      row.period = leaf.period;
      row.number = text(leaf.periods);
      break;
    case "checklist":
      row.items = leaf.items.map((i) => ({ ...i }));
      break;
    case "measurement":
      row.trackerId = leaf.trackerId;
      row.comparison = leaf.comparison;
      row.basis = leaf.basis;
      row.number = text(leaf.value);
      break;
  }
  return row;
}

function toLeaf(row: Row, locale: string): RuleLeaf {
  const n = parseTypedAmount(row.number, locale) ?? Number.NaN;
  switch (row.kind) {
    case "invested":
    case "gains":
      return {
        kind: row.kind,
        target:
          row.targetMode === "priceMultiple"
            ? { kind: "priceMultiple", multiple: n }
            : { kind: "amount", amount: n },
      };
    case "netWorth":
      return { kind: "netWorth", amount: n };
    case "cooldown":
      return { kind: "cooldown", days: n };
    case "counter":
      return { kind: "counter", trackerId: row.trackerId, count: n };
    case "streak":
      return {
        kind: "streak",
        trackerId: row.trackerId,
        perPeriod: parseTypedAmount(row.perPeriod, locale) ?? Number.NaN,
        period: row.period,
        periods: n,
      };
    case "checklist":
      return { kind: "checklist", items: row.items };
    case "measurement":
      return {
        kind: "measurement",
        trackerId: row.trackerId,
        comparison: row.comparison,
        value: n,
        basis: row.basis,
      };
  }
}

/** Whether the builder can show `rule`: one group of checks, or a single check. */
function isFlat(rule: RuleNode): boolean {
  return !isGroup(rule) || rule.children.every((c) => !isGroup(c));
}

function GoalEditorForm({ onOpenChange, goal, trackers, backdateUntil }: GoalEditorDialogProps) {
  const t = useTranslations("strategies.goals.editor");
  const tRule = useTranslations("strategies.goals.rule");
  const tActions = useTranslations("common.actions");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const { code } = useDisplayCurrency();
  const createGoal = useCreateGoal();
  const updateGoal = useUpdateGoal();

  const initialRule = goal?.rule;
  const flat = !initialRule || isFlat(initialRule);
  const [name, setName] = useState(goal?.name ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [currency, setCurrency] = useState(goal?.currency ?? code);
  const [price, setPrice] = useState(goal ? typedAmountText(goal.price, locale) : "");
  // A rule the builder cannot show (nested groups), kept as it is
  const [fixedRule, setFixedRule] = useState<RuleNode | null>(flat ? null : (initialRule ?? null));
  const [combinator, setCombinator] = useState<Combinator>(
    initialRule && isGroup(initialRule) ? initialRule.kind : "all",
  );
  const [atLeast, setAtLeast] = useState(
    initialRule && initialRule.kind === "atLeast" ? String(initialRule.count) : "1",
  );
  const [rows, setRows] = useState<Row[]>(() => {
    if (!initialRule) return [blankRow("invested", trackers)];
    if (!flat) return [blankRow("invested", trackers)];
    const leaves = isGroup(initialRule) ? (initialRule.children as RuleLeaf[]) : [initialRule];
    return leaves.map((l) => toRow(l, locale));
  });
  const today = useUtcToday();
  const canBackdate =
    !goal && backdateUntil !== undefined && Date.parse(`${today}T00:00:00Z`) < backdateUntil;
  const [startDate, setStartDate] = useState(today);
  const [saving, setSaving] = useState(false);
  /** Why the last save was refused, shown under the form until the next try */
  const [problem, setProblem] = useState<{ message: string; rule: boolean } | null>(null);
  /** The rule is a single check rather than a group (kept so a save does not reshape it) */
  const [bare, setBare] = useState(initialRule ? !isGroup(initialRule) : true);

  const patch = (key: number, change: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const buildRule = (): RuleNode => {
    if (fixedRule) return fixedRule;
    const leaves = rows.map((r) => toLeaf(r, locale));
    if (leaves.length === 1 && combinator === "all" && bare) return leaves[0];
    return combinator === "atLeast"
      ? { kind: "atLeast", count: parseTypedAmount(atLeast, locale) ?? Number.NaN, children: leaves }
      : { kind: combinator, children: leaves };
  };

  const submit = async () => {
    const input = {
      name,
      description: description || undefined,
      currency,
      price: parseTypedAmount(price, locale) ?? Number.NaN,
      rule: buildRule(),
    };
    const checked = normalizeGoal(input);
    if (!checked.ok) {
      const message = errorMessage(null, checked.error as ErrorCode);
      setProblem({ message, rule: checked.error === "goalRuleInvalid" });
      toast.error(message);
      return;
    }
    setProblem(null);
    setSaving(true);
    try {
      if (goal) await updateGoal({ goalId: goal._id, ...input });
      else await createGoal(canBackdate && startDate !== today ? { ...input, startDate } : input);
      toast.success(t(goal ? "saved" : "created", { name: checked.goal.name }));
      onOpenChange(false);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const trackerOptions = (kind: "count" | "measurement") =>
    trackers.filter((tr) => tr.kind === kind);

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{t(goal ? "editTitle" : "newTitle")}</DialogTitle>
        <DialogDescription>{t("description")}</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="goal-name">{t("name")}</Label>
          <Input id="goal-name" value={name} placeholder={t("namePlaceholder")} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goal-description">{t("notes")}</Label>
          <Textarea id="goal-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="grid grid-cols-[1fr_8rem] gap-3">
          <div className="space-y-2">
            <Label htmlFor="goal-price">{t("price")}</Label>
            <Input id="goal-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t("currency")}</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger aria-label={t("currency")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DISPLAY_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {canBackdate && (
          <div className="space-y-2">
            <Label htmlFor="goal-start">{t("startDate")}</Label>
            <Input id="goal-start" type="date" className="w-44" max={today} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("startDateHint")}</p>
          </div>
        )}

        <div className="space-y-3 rounded-md border p-3">
          <div className="text-sm font-medium">{t("rule")}</div>
          <p className="text-xs text-muted-foreground">{t("ruleHint")}</p>

          <RuleAssistant
            currency={currency}
            trackers={trackers}
            onApply={(rule) => {
              setBare(!isGroup(rule));
              if (isFlat(rule)) {
                setFixedRule(null);
                setCombinator(isGroup(rule) ? rule.kind : "all");
                if (rule.kind === "atLeast") setAtLeast(String(rule.count));
                const leaves = isGroup(rule) ? (rule.children as RuleLeaf[]) : [rule];
                setRows(leaves.map((l) => toRow(l, locale)));
              } else {
                setFixedRule(rule);
              }
            }}
          />

          {fixedRule ? (
            <div className="space-y-2 text-sm">
              <p>{t("nestedRule")}</p>
              <Button variant="outline" size="sm" onClick={() => setFixedRule(null)}>
                {t("startOver")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={combinator} onValueChange={(v) => setCombinator(v as Combinator)}>
                  <SelectTrigger className="w-56" aria-label={t("combinator")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{tRule("all")}</SelectItem>
                    <SelectItem value="any">{tRule("any")}</SelectItem>
                    <SelectItem value="atLeast">{t("atLeastN")}</SelectItem>
                  </SelectContent>
                </Select>
                {combinator === "atLeast" && (
                  <Input
                    className="w-20"
                    inputMode="numeric"
                    aria-label={t("atLeastCount")}
                    value={atLeast}
                    onChange={(e) => setAtLeast(e.target.value)}
                  />
                )}
              </div>

              {rows.map((row) => (
                <div key={row.key} className="space-y-2 rounded-md bg-muted/40 p-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={row.kind}
                      onValueChange={(v) => {
                        const fresh = blankRow(v as RuleLeafKind, trackers);
                        patch(row.key, { ...fresh, key: row.key });
                      }}
                    >
                      <SelectTrigger className="flex-1" aria-label={t("checkKind")}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RULE_LEAF_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {t(`kinds.${k}`)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("removeCheck")}
                      disabled={rows.length === 1}
                      onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <RowFields
                    row={row}
                    patch={(c) => patch(row.key, c)}
                    counts={trackerOptions("count")}
                    measures={trackerOptions("measurement")}
                    currency={currency}
                  />
                </div>
              ))}

              <Button
                variant="outline"
                size="sm"
                disabled={rows.length >= 10}
                onClick={() => setRows((rs) => [...rs, blankRow("cooldown", trackers)])}
              >
                <Plus className="me-1 h-4 w-4" />
                {t("addCheck")}
              </Button>
            </>
          )}
        </div>
        {problem && (
          <p className="text-sm text-destructive">{problem.rule ? t("invalid") : problem.message}</p>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
          {tActions("cancel")}
        </Button>
        <Button onClick={() => void submit()} disabled={saving}>
          {saving && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
          {t(goal ? "save" : "create")}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

interface RowFieldsProps {
  row: Row;
  patch: (change: Partial<Row>) => void;
  counts: readonly TrackerView[];
  measures: readonly TrackerView[];
  currency: string;
}

/** The fields of one check, by its kind. */
function RowFields({ row, patch, counts, measures, currency }: RowFieldsProps) {
  const t = useTranslations("strategies.goals.editor");
  const number = (label: string) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input inputMode="decimal" value={row.number} onChange={(e) => patch({ number: e.target.value })} />
    </div>
  );
  const trackerSelect = (options: readonly TrackerView[]) =>
    options.length === 0 ? (
      <p className="text-xs text-muted-foreground">{t("noTrackers")}</p>
    ) : (
      <div className="space-y-1">
        <Label className="text-xs">{t("tracker")}</Label>
        <Select value={row.trackerId} onValueChange={(v) => patch({ trackerId: v })}>
          <SelectTrigger aria-label={t("tracker")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o._id} value={o._id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  const pick = <T extends string>(value: T, values: readonly T[], label: string, onChange: (v: T) => void) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v}>
              {t(`options.${v}` as "options.week")}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  switch (row.kind) {
    case "invested":
    case "gains":
      return (
        <div className="grid grid-cols-2 gap-2">
          {pick(row.targetMode, ["priceMultiple", "amount"] as const, t("target"), (v) => patch({ targetMode: v }))}
          {number(row.targetMode === "priceMultiple" ? t("multiple") : t("amount", { currency }))}
        </div>
      );
    case "netWorth":
      return number(t("amount", { currency }));
    case "cooldown":
      return number(t("days"));
    case "counter":
      return (
        <div className="grid grid-cols-2 gap-2">
          {trackerSelect(counts)}
          {number(t("count"))}
        </div>
      );
    case "streak":
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {trackerSelect(counts)}
          <div className="space-y-1">
            <Label className="text-xs">{t("perPeriod")}</Label>
            <Input inputMode="numeric" value={row.perPeriod} onChange={(e) => patch({ perPeriod: e.target.value })} />
          </div>
          {pick(row.period, ["week", "month"] as const, t("period"), (v) => patch({ period: v }))}
          {number(t("periods"))}
        </div>
      );
    case "measurement":
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {trackerSelect(measures)}
          {pick(row.comparison, ["atLeast", "atMost"] as const, t("comparison"), (v) => patch({ comparison: v }))}
          {number(t("value"))}
          {pick(row.basis, ["best", "latest"] as const, t("basis"), (v) => patch({ basis: v }))}
        </div>
      );
    case "checklist":
      return (
        <div className="space-y-2">
          {row.items.map((item, i) => (
            <div key={item.id} className="flex items-center gap-2">
              <Input
                value={item.label}
                aria-label={t("step")}
                placeholder={t("stepPlaceholder")}
                onChange={(e) =>
                  patch({
                    items: row.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)),
                  })
                }
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("removeStep")}
                disabled={row.items.length === 1}
                onClick={() => patch({ items: row.items.filter((_, j) => j !== i) })}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => patch({ items: [...row.items, { id: newStepId(), label: "" }] })}
          >
            <Plus className="me-1 h-4 w-4" />
            {t("addStep")}
          </Button>
        </div>
      );
  }
}

/**
 * The assistant: the user's own words in, a rule draft out (validated on
 * the server), applied to the builder once the user has read its summary.
 * Trackers the rule needs are created on apply.
 */
function RuleAssistant({
  currency,
  trackers,
  onApply,
}: {
  currency: string;
  trackers: readonly TrackerView[];
  onApply: (rule: RuleNode) => void;
}) {
  const t = useTranslations("strategies.goals.editor.ai");
  const tErrors = useTranslations("common.errors");
  const locale = useLocale();
  const draftRule = useAction(api.goalsAi.draftRule);
  const isAvailable = useAction(api.goalsAi.available);
  const createTracker = useCreateTracker();
  const [available, setAvailable] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    isAvailable({})
      .then((ok) => live && setAvailable(ok))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [isAvailable]);

  if (!available) return null;

  const write = async () => {
    setBusy(true);
    setDraft(null);
    setNote(null);
    try {
      const language = new Intl.DisplayNames(["en"], { type: "language" }).of(locale) ?? "English";
      const result = await draftRule({ text, currency, language });
      if (result.ok) setDraft(result.draft);
      else setNote(t(result.reason));
    } catch (e) {
      setNote(toActionError(e, (minutes) => tErrors("rateLimited", { minutes })).message);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const ids = new Map<string, string>();
      for (const tracker of draft.newTrackers) {
        // Reuse one with the same name and kind (a retry after a failed apply)
        const existing = trackers.find(
          (x) => x.kind === tracker.kind && x.name.toLowerCase() === tracker.name.toLowerCase(),
        );
        ids.set(
          tracker.ref,
          existing?._id ??
            (await createTracker({ name: tracker.name, kind: tracker.kind, unit: tracker.unit })),
        );
      }
      onApply(withCreatedTrackers(draft.rule, ids));
      setNote(t("applied"));
      setDraft(null);
    } catch (e) {
      setNote(toActionError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-md bg-muted/40 p-3">
      <Label htmlFor="goal-ai" className="flex items-center gap-1.5">
        <Sparkles className="h-4 w-4" />
        {t("title")}
      </Label>
      <Textarea
        id="goal-ai"
        rows={3}
        value={text}
        placeholder={t("placeholder")}
        onChange={(e) => setText(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <Button size="sm" variant="secondary" onClick={() => void write()} disabled={busy || text.trim().length < 3}>
        {busy && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
        {t(busy ? "writing" : "write")}
      </Button>
      {draft && (
        <div className="space-y-2 rounded-md border bg-background p-3 text-sm">
          <div className="font-medium">{t("suggestion")}</div>
          <p>{draft.summary}</p>
          {draft.newTrackers.length > 0 && (
            <p className="text-muted-foreground">
              {t("newTrackers", { names: draft.newTrackers.map((x) => x.name).join(", ") })}
            </p>
          )}
          {draft.unsupported.length > 0 && (
            <p className="text-amber-700 dark:text-amber-400">
              {t("unsupported", { items: draft.unsupported.join("; ") })}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void apply()} disabled={busy}>
              {t("use")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={busy}>
              {t("discard")}
            </Button>
          </div>
        </div>
      )}
      {note && <p className="text-sm text-muted-foreground">{note}</p>}
    </div>
  );
}
