"use client";

import { useState, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useUser } from "@clerk/nextjs";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useSaveScenario, useDeleteScenario } from "@/hooks/convex/loans";
import {
  getMonthsPerPeriod,
  projectLoan,
  resolveRecurringExtras,
  type LoanProjection,
  type RecurringExtra,
  type PrepaymentEffect,
  type ProjectLoanOptions,
} from "@/../services/finance/loanScheduleService";
import { todayLocalISO } from "@/lib/utils/date";
import { formatCurrency as formatMoney } from "@/lib/utils/currency";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/shadcn/chart";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Bar,
  BarChart,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/shadcn/alert-dialog";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Plus,
  Trash2,
  Loader2,
  Lightbulb,
  Target,
  TrendingDown,
  Calendar,
  DollarSign,
  Clock,
  Save,
  ArrowRight,
  X,
} from "lucide-react";

type Loan = Doc<"loans">;
type LoanPayment = Doc<"loanPayments">;
type LoanScenario = Doc<"loanScenarios">;

interface LoanScenariosTabProps {
  loan: Loan;
  payments: LoanPayment[];
  scenarios: LoanScenario[];
}

interface OneTimePrepayment {
  id: string;
  date: string;
  amount: number;
}

/** A recurring extra being edited; blank dates are unbounded. */
interface RecurringExtraRow {
  id: string;
  amount: number;
  from: string;
  until: string;
}

function toRecurringExtras(rows: RecurringExtraRow[]): RecurringExtra[] {
  return rows
    .filter((row) => row.amount > 0)
    .map(({ amount, from, until }) => ({
      amount,
      ...(from && { from }),
      ...(until && { until }),
    }));
}

interface ScenarioResult {
  originalMonths: number;
  newMonths: number;
  monthsSaved: number;
  originalTotalInterest: number;
  newTotalInterest: number;
  interestSaved: number;
  originalEndDate: string;
  newEndDate: string;
  totalExtraPayments: number;
  totalPenalty: number;
  prepaymentsCapped: number;
  // Chart data
  balanceHistory: Array<{
    date: string;
    originalBalance: number | null;
    scenarioBalance: number | null;
  }>;
  paymentBreakdown: Array<{
    period: string;
    originalPrincipal: number;
    originalInterest: number;
    scenarioPrincipal: number;
    scenarioInterest: number;
    extraPayment: number;
  }>;
}

// Helper functions
function formatCurrency(value: number, currency: string = "USD"): string {
  return formatMoney(value, currency, { fractionDigits: 0 });
}

// Which bounds a recurring extra has (the loans.scenarios.recurringExtra range)
function rangeKind(extra: RecurringExtra): "both" | "from" | "until" | "none" {
  if (extra.from && extra.until) return "both";
  if (extra.from) return "from";
  if (extra.until) return "until";
  return "none";
}

type BreakdownSeries =
  | "originalPrincipal"
  | "originalInterest"
  | "scenarioPrincipal"
  | "scenarioInterest"
  | "extraPayment";

type ScenariosT = ReturnType<typeof useTranslations<"loans.scenarios">>;

// The contract's prepayment limit and penalty, as the simulation applies them
function contractTerms(loan: Loan, t: ScenariosT): string {
  const limit = loan.maxAnnualPrepaymentRate;
  const penalty = loan.prepaymentPenaltyRate
    ? (loan.prepaymentPenaltyRate * 100).toFixed(2)
    : undefined;
  if (limit === undefined) {
    return penalty ? t("contractPenalty", { penalty }) : "";
  }
  if (limit > 0) {
    const rate = (limit * 100).toFixed(1);
    return penalty
      ? t("contractLimitAndPenalty", { rate, penalty })
      : t("contractLimit", { rate });
  }
  return penalty
    ? t("contractNoPrepaymentsAndPenalty", { penalty })
    : t("contractNoPrepayments");
}

// Closing balance at the end of each calendar year, starting from today
function yearlyBalances(
  projection: LoanProjection,
  today: string,
  openingBalance: number,
): Map<string, number> {
  const byYear = new Map([[today.slice(0, 4), openingBalance]]);
  for (const row of projection.rows) {
    byYear.set(row.dueDate.slice(0, 4), row.closingBalance);
  }
  return byYear;
}

// The current plan and the scenario are two projections of the same engine,
// so the What-If agrees with the Overview and Schedule tabs for every loan type
function calculateScenario(
  loan: Loan,
  payments: LoanPayment[],
  options: ProjectLoanOptions,
  formatPeriod: (date: string) => string,
): ScenarioResult {
  const today = todayLocalISO();
  const original = projectLoan(loan, payments, {}, today);
  const scenario = projectLoan(loan, payments, options, today);
  const monthsPerPeriod = getMonthsPerPeriod(loan.paymentFrequency);

  const originalYears = yearlyBalances(original, today, loan.currentBalance);
  const scenarioYears = yearlyBalances(scenario, today, loan.currentBalance);
  const balanceHistory = [
    ...new Set([...originalYears.keys(), ...scenarioYears.keys()]),
  ]
    .sort()
    .map((year) => ({
      date: year,
      originalBalance: originalYears.get(year) ?? null,
      scenarioBalance: scenarioYears.get(year) ?? null,
    }));

  const periodsToShow = Math.min(
    12,
    Math.max(original.rows.length, scenario.rows.length),
  );
  const paymentBreakdown = Array.from({ length: periodsToShow }, (_, i) => {
    const orig = original.rows[i];
    const scen = scenario.rows[i];
    return {
      period: formatPeriod((orig ?? scen).dueDate),
      originalPrincipal: orig?.principal ?? 0,
      originalInterest: orig?.interest ?? 0,
      scenarioPrincipal: scen?.principal ?? 0,
      scenarioInterest: scen?.interest ?? 0,
      extraPayment:
        (scen?.prepayment ?? 0) + (i === 0 ? scenario.initialPrepayment : 0),
    };
  });

  const originalMonths = original.rows.length * monthsPerPeriod;
  const newMonths = scenario.rows.length * monthsPerPeriod;
  return {
    originalMonths,
    newMonths,
    monthsSaved: originalMonths - newMonths,
    originalTotalInterest: original.totalInterest,
    newTotalInterest: scenario.totalInterest,
    interestSaved: original.totalInterest - scenario.totalInterest,
    originalEndDate: original.payoffDate ?? today,
    newEndDate: scenario.payoffDate ?? today,
    totalExtraPayments: scenario.totalPrepayments,
    totalPenalty: scenario.totalPenalty,
    prepaymentsCapped: scenario.prepaymentsCapped,
    balanceHistory,
    paymentBreakdown,
  };
}

export function LoanScenariosTab({
  loan,
  payments,
  scenarios,
}: LoanScenariosTabProps) {
  const t = useTranslations("loans.scenarios");
  const tLoans = useTranslations("loans");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  // Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight:
  // shown as month and year ("Nov 2026")
  const formatDate = (date: string) =>
    format.dateTime(new Date(date), "monthYear", {
      month: "short",
      timeZone: "UTC",
    });
  const duration = (months: number) =>
    tLoans("duration", { years: Math.floor(months / 12), months: months % 12 });
  const recurringExtraLabel = (extra: RecurringExtra) =>
    t("recurringExtra", {
      amount: formatCurrency(extra.amount, loan.currency),
      frequency: loan.paymentFrequency,
      range: rangeKind(extra),
      from: extra.from ? formatDate(extra.from) : "",
      until: extra.until ? formatDate(extra.until) : "",
    });

  const balanceChartConfig: ChartConfig = {
    originalBalance: { label: t("currentPlan"), color: "hsl(221, 83%, 53%)" },
    scenarioBalance: {
      label: t("withPrepayments"),
      color: "hsl(142, 76%, 36%)",
    },
  };
  const paymentChartConfig: ChartConfig = {
    originalPrincipal: {
      label: t("series.originalPrincipal"),
      color: "hsl(221, 83%, 53%)",
    },
    originalInterest: {
      label: t("series.originalInterest"),
      color: "hsl(221, 60%, 70%)",
    },
    scenarioPrincipal: {
      label: t("series.scenarioPrincipal"),
      color: "hsl(142, 76%, 36%)",
    },
    scenarioInterest: {
      label: t("series.scenarioInterest"),
      color: "hsl(142, 50%, 60%)",
    },
  };

  const { user } = useUser();
  const { saveScenario } = useSaveScenario();
  const { deleteScenario } = useDeleteScenario();

  // Extra principal per payment period (not per month), each between
  // optional first/last due dates; the active ones add up
  const [recurringExtras, setRecurringExtras] = useState<RecurringExtraRow[]>(
    [],
  );
  const [newRatePercent, setNewRatePercent] = useState("");
  const [prepaymentEffect, setPrepaymentEffect] =
    useState<PrepaymentEffect>("reduce_term");
  const [oneTimePrepayments, setOneTimePrepayments] = useState<
    OneTimePrepayment[]
  >([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [scenarioName, setScenarioName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // New prepayment form state
  const [newPrepaymentDate, setNewPrepaymentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [newPrepaymentAmount, setNewPrepaymentAmount] = useState("");

  // Payment frequency label
  const frequencyLabel = tLoans(`frequency.${loan.paymentFrequency}`);

  const newRate =
    newRatePercent === "" ? undefined : parseFloat(newRatePercent) / 100;

  // Calculate live scenario
  const liveScenario = useMemo(
    () =>
      calculateScenario(
        loan,
        payments,
        {
          recurringExtras: toRecurringExtras(recurringExtras),
          oneTimePrepayments,
          newRate,
          prepaymentEffect,
        },
        (date) =>
          format.dateTime(new Date(date), "monthYear", {
            month: "short",
            timeZone: "UTC",
          }),
      ),
    [
      loan,
      payments,
      recurringExtras,
      oneTimePrepayments,
      newRate,
      prepaymentEffect,
      format,
    ],
  );

  const handleAddPrepayment = () => {
    const amount = parseFloat(newPrepaymentAmount);
    if (!amount || amount <= 0) return;

    setOneTimePrepayments((prev) => [
      ...prev,
      {
        id: `prepay-${Date.now()}`,
        date: newPrepaymentDate,
        amount,
      },
    ]);
    setNewPrepaymentAmount("");
  };

  const handleRemovePrepayment = (id: string) => {
    setOneTimePrepayments((prev) => prev.filter((p) => p.id !== id));
  };

  const handleAddRecurringExtra = () => {
    setRecurringExtras((prev) => [
      ...prev,
      { id: `extra-${Date.now()}`, amount: 0, from: "", until: "" },
    ]);
  };

  const handleUpdateRecurringExtra = (
    id: string,
    updates: Partial<Omit<RecurringExtraRow, "id">>,
  ) => {
    setRecurringExtras((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...updates } : row)),
    );
  };

  const handleRemoveRecurringExtra = (id: string) => {
    setRecurringExtras((prev) => prev.filter((row) => row.id !== id));
  };

  const handleSaveScenario = async () => {
    if (!user?.id || !scenarioName) return;

    setIsSubmitting(true);
    try {
      await saveScenario({
        loanId: loan._id,
        name: scenarioName,
        recurringExtras: toRecurringExtras(recurringExtras),
        oneTimePrepayments: oneTimePrepayments.map(({ date, amount }) => ({
          date,
          amount,
        })),
        newInterestRate: newRate,
        prepaymentEffect,
        projectedEndDate: liveScenario.newEndDate,
        totalInterestSaved: liveScenario.interestSaved,
        monthsSaved: liveScenario.monthsSaved,
      });
      setScenarioName("");
      setShowSaveDialog(false);
    } catch (error) {
      console.error("Failed to save scenario:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteScenario = async (scenarioId: Id<"loanScenarios">) => {
    setDeletingId(scenarioId);
    try {
      await deleteScenario(scenarioId);
    } catch (error) {
      console.error("Failed to delete scenario:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadScenario = (scenario: LoanScenario) => {
    setRecurringExtras(
      resolveRecurringExtras(scenario).map((extra, i) => ({
        id: `saved-extra-${i}`,
        amount: extra.amount,
        from: extra.from ?? "",
        until: extra.until ?? "",
      })),
    );
    setOneTimePrepayments(
      (scenario.oneTimePrepayments ?? []).map((p, i) => ({
        id: `saved-${i}`,
        ...p,
      })),
    );
    setNewRatePercent(
      scenario.newInterestRate !== undefined
        ? String(scenario.newInterestRate * 100)
        : "",
    );
    setPrepaymentEffect(scenario.prepaymentEffect ?? "reduce_term");
  };

  const activeRecurringExtras = toRecurringExtras(recurringExtras);
  const hasChanges =
    activeRecurringExtras.length > 0 ||
    oneTimePrepayments.length > 0 ||
    newRate !== undefined;

  return (
    <div className="space-y-6">
      {/* Interactive Simulator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-lg">{t("title")}</CardTitle>
          </div>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Recurring extra payments */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <Label>
                {t("additionalPrincipal", { frequency: frequencyLabel })}
              </Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleAddRecurringExtra}
              >
                <Plus className="h-4 w-4 me-1" />
                {t("addRecurring")}
              </Button>
            </div>
            {recurringExtras.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noRecurring", {
                  eachPayment: tLoans("eachPayment", {
                    frequency: loan.paymentFrequency,
                  }),
                })}
              </p>
            ) : (
              <div className="space-y-2">
                {recurringExtras.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-wrap items-end gap-2 p-2 rounded-lg bg-muted"
                  >
                    <div className="relative w-36">
                      <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        {loan.currency}
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="25"
                        aria-label={t("amountPerPayment")}
                        value={row.amount || ""}
                        placeholder={t("amount")}
                        onChange={(e) =>
                          handleUpdateRecurringExtra(row.id, {
                            amount: Math.max(0, parseFloat(e.target.value) || 0),
                          })
                        }
                        className="ps-12"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`${row.id}-from`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("from")}
                      </Label>
                      <Input
                        id={`${row.id}-from`}
                        type="date"
                        value={row.from}
                        onChange={(e) =>
                          handleUpdateRecurringExtra(row.id, {
                            from: e.target.value,
                          })
                        }
                        className="w-auto"
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`${row.id}-until`}
                        className="text-xs text-muted-foreground"
                      >
                        {t("until")}
                      </Label>
                      <Input
                        id={`${row.id}-until`}
                        type="date"
                        value={row.until}
                        onChange={(e) =>
                          handleUpdateRecurringExtra(row.id, {
                            until: e.target.value,
                          })
                        }
                        className="w-auto"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      aria-label={t("removeRecurring")}
                      onClick={() => handleRemoveRecurringExtra(row.id)}
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground">
                  {t("blankDates")}
                </p>
              </div>
            )}
          </div>

          {/* Prepayment effect & refinancing rate */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
            <div>
              <Label className="mb-2 block">{t("prepayments")}</Label>
              <div className="flex gap-2">
                {(
                  [
                    ["reduce_term", t("reduceTerm")],
                    ["reduce_payment", t("reducePayment")],
                  ] as const
                ).map(([value, label]) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={prepaymentEffect === value ? "default" : "outline"}
                    onClick={() => setPrepaymentEffect(value)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="whatif-rate" className="mb-2 block">
                {t("newRate")}
              </Label>
              <Input
                id="whatif-rate"
                type="number"
                step="0.01"
                placeholder={(loan.annualInterestRate * 100).toFixed(2)}
                value={newRatePercent}
                onChange={(e) => setNewRatePercent(e.target.value)}
                className="w-40"
              />
            </div>
          </div>
          {(loan.maxAnnualPrepaymentRate !== undefined ||
            !!loan.prepaymentPenaltyRate) && (
            <p className="text-xs text-muted-foreground">
              {contractTerms(loan, t)}
            </p>
          )}

          {/* One-Time Prepayments */}
          <div className="border-t pt-4">
            <Label className="mb-3 block">{t("oneTimePrepayments")}</Label>
            <div className="flex gap-2 mb-3">
              <Input
                type="date"
                value={newPrepaymentDate}
                onChange={(e) => setNewPrepaymentDate(e.target.value)}
                className="w-40"
              />
              <div className="relative flex-1">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {loan.currency}
                </span>
                <Input
                  type="number"
                  placeholder={t("amount")}
                  aria-label={t("amount")}
                  value={newPrepaymentAmount}
                  onChange={(e) => setNewPrepaymentAmount(e.target.value)}
                  className="ps-12"
                />
              </div>
              <Button
                onClick={handleAddPrepayment}
                size="icon"
                variant="outline"
                aria-label={t("addPrepayment")}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            {oneTimePrepayments.length > 0 && (
              <div className="space-y-2">
                {oneTimePrepayments.map((prepayment) => (
                  <div
                    key={prepayment.id}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted"
                  >
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        {formatDate(prepayment.date)}
                      </Badge>
                      <span className="font-medium">
                        {formatCurrency(prepayment.amount, loan.currency)}
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={t("removePrepayment")}
                      onClick={() => handleRemovePrepayment(prepayment.id)}
                    >
                      <X className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Results Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6 border-t pt-6">
            <div className="space-y-4">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase">
                {t("currentPlan")}
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("payoffDate")}
                  </span>
                  <span className="font-medium">
                    {formatDate(liveScenario.originalEndDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("totalInterest")}
                  </span>
                  <span className="font-medium">
                    {formatCurrency(
                      liveScenario.originalTotalInterest,
                      loan.currency,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    {t("timeLeft")}
                  </span>
                  <span className="font-medium">
                    {duration(liveScenario.originalMonths)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="h-8 w-8 text-muted-foreground rtl:-scale-x-100" />
            </div>

            <div className="space-y-4 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <h4 className="font-semibold text-sm text-green-700 dark:text-green-400 uppercase">
                {t("withPrepayments")}
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700 dark:text-green-400">
                    {t("payoffDate")}
                  </span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {formatDate(liveScenario.newEndDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700 dark:text-green-400">
                    {t("totalInterest")}
                  </span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {formatCurrency(
                      liveScenario.newTotalInterest,
                      loan.currency,
                    )}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700 dark:text-green-400">
                    {t("timeLeft")}
                  </span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {duration(liveScenario.newMonths)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Savings Summary */}
          {hasChanges && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 rounded-lg bg-muted">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  {t("timeSaved")}
                </p>
                <p className="text-2xl font-bold text-blue-600">
                  {duration(liveScenario.monthsSaved)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  {t("interestSaved")}
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(liveScenario.interestSaved, loan.currency)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  {t("totalPrepaid")}
                </p>
                <p className="text-2xl font-bold text-orange-600">
                  {formatCurrency(
                    liveScenario.totalExtraPayments,
                    loan.currency,
                  )}
                </p>
              </div>
            </div>
          )}

          {hasChanges &&
            (liveScenario.totalPenalty > 0 ||
              liveScenario.prepaymentsCapped > 0) && (
              <div className="text-sm text-amber-600">
                {liveScenario.prepaymentsCapped > 0 && (
                  <p>
                    {t("capped", {
                      amount: formatCurrency(
                        liveScenario.prepaymentsCapped,
                        loan.currency,
                      ),
                    })}
                  </p>
                )}
                {liveScenario.totalPenalty > 0 && (
                  <p>
                    {t("penalties", {
                      amount: formatCurrency(
                        liveScenario.totalPenalty,
                        loan.currency,
                      ),
                    })}
                  </p>
                )}
              </div>
            )}

          {/* Save Button */}
          {hasChanges && (
            <div className="flex justify-end">
              <Button onClick={() => setShowSaveDialog(true)}>
                <Save className="h-4 w-4 me-2" />
                {t("saveThis")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Charts Side by Side */}
      {hasChanges && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Balance Over Time Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("balanceTitle")}</CardTitle>
              <CardDescription>{t("balanceDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={balanceChartConfig}
                className="h-[300px] w-full"
              >
                <AreaChart data={liveScenario.balanceHistory}>
                  <defs>
                    <linearGradient
                      id="originalGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(221, 83%, 53%)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(221, 83%, 53%)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                    <linearGradient
                      id="scenarioGradient"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="hsl(142, 76%, 36%)"
                        stopOpacity={0.3}
                      />
                      <stop
                        offset="95%"
                        stopColor="hsl(142, 76%, 36%)"
                        stopOpacity={0}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(value) =>
                      formatCurrency(value, loan.currency)
                    }
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => {
                          if (value === null) return null;
                          const label =
                            name === "originalBalance"
                              ? t("currentPlan")
                              : t("withPrepayments");
                          return [
                            formatCurrency(value as number, loan.currency),
                            label,
                          ];
                        }}
                      />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="originalBalance"
                    stroke="hsl(221, 83%, 53%)"
                    fill="url(#originalGradient)"
                    strokeWidth={2}
                    connectNulls
                  />
                  <Area
                    type="monotone"
                    dataKey="scenarioBalance"
                    stroke="hsl(142, 76%, 36%)"
                    fill="url(#scenarioGradient)"
                    strokeWidth={2}
                    connectNulls
                  />
                </AreaChart>
              </ChartContainer>
              <div className="flex justify-center gap-6 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-[hsl(221,83%,53%)]" />
                  <span>{t("currentPlan")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-[hsl(142,76%,36%)]" />
                  <span>{t("withPrepayments")}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Breakdown Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("breakdownTitle")}</CardTitle>
              <CardDescription>
                {t("breakdownDescription", {
                  count: liveScenario.paymentBreakdown.length,
                })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={paymentChartConfig}
                className="h-[300px] w-full"
              >
                <BarChart data={liveScenario.paymentBreakdown}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="period"
                    tickLine={false}
                    axisLine={false}
                    fontSize={10}
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      formatCurrency(value, loan.currency)
                    }
                    tickLine={false}
                    axisLine={false}
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value, name) => [
                          formatCurrency(value as number, loan.currency),
                          t(`series.${name as BreakdownSeries}`),
                        ]}
                      />
                    }
                  />
                  {/* Original payments - stacked */}
                  <Bar
                    dataKey="originalPrincipal"
                    stackId="original"
                    fill="hsl(221, 83%, 53%)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="originalInterest"
                    stackId="original"
                    fill="hsl(221, 60%, 75%)"
                    radius={[4, 4, 0, 0]}
                  />
                  {/* Scenario payments - stacked */}
                  <Bar
                    dataKey="scenarioPrincipal"
                    stackId="scenario"
                    fill="hsl(142, 76%, 36%)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="scenarioInterest"
                    stackId="scenario"
                    fill="hsl(142, 50%, 60%)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="extraPayment"
                    stackId="scenario"
                    fill="hsl(45, 93%, 47%)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
              <div className="flex flex-wrap justify-center gap-4 mt-4 text-sm">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground font-medium">
                    {t("legendCurrent")}
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(221,83%,53%)]" />
                    <span>{t("principal")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(221,60%,75%)]" />
                    <span>{t("interest")}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground font-medium">
                    {t("legendScenario")}
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(142,76%,36%)]" />
                    <span>{t("principal")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(142,50%,60%)]" />
                    <span>{t("interest")}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(45,93%,47%)]" />
                    <span>{t("extra")}</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Saved Scenarios */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("savedTitle")}</CardTitle>
          <CardDescription>{t("savedDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          {scenarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>{t("savedEmpty")}</p>
              <p className="text-sm">{t("savedEmptyHint")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scenarios.map((scenario) => (
                <Card key={scenario._id} className="relative group">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 end-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        disabled={deletingId === scenario._id}
                      >
                        {deletingId === scenario._id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-500" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("deleteDescription", { name: scenario.name })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>
                          {tActions("cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteScenario(scenario._id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          {tActions("delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <CardContent className="pt-6">
                    <h4 className="font-semibold mb-4">{scenario.name}</h4>
                    <div className="space-y-2 text-sm">
                      {resolveRecurringExtras(scenario).map((extra, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <span>{recurringExtraLabel(extra)}</span>
                        </div>
                      ))}
                      {(scenario.oneTimePrepayments?.length ?? 0) > 0 && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {t("oneTimeCount", {
                              count: scenario.oneTimePrepayments!.length,
                            })}
                          </span>
                        </div>
                      )}
                      {scenario.monthsSaved !== undefined &&
                        scenario.monthsSaved > 0 && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            <span>
                              {t("durationSaved", {
                                duration: duration(scenario.monthsSaved),
                              })}
                            </span>
                          </div>
                        )}
                      {scenario.totalInterestSaved !== undefined &&
                        scenario.totalInterestSaved > 0 && (
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-green-500" />
                            <span className="text-green-600 font-medium">
                              {t("amountSaved", {
                                amount: formatCurrency(
                                  scenario.totalInterestSaved,
                                  loan.currency,
                                ),
                              })}
                            </span>
                          </div>
                        )}
                      {scenario.projectedEndDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            {t("payoff", {
                              date: formatDate(scenario.projectedEndDate),
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full mt-4"
                      onClick={() => handleLoadScenario(scenario)}
                    >
                      {t("load")}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("saveTitle")}</DialogTitle>
            <DialogDescription>{t("saveDescription")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="scenario-name">{t("scenarioName")}</Label>
              <Input
                id="scenario-name"
                placeholder={t("scenarioNamePlaceholder", {
                  amount: formatCurrency(
                    activeRecurringExtras[0]?.amount ?? 0,
                    loan.currency,
                  ),
                  frequency: frequencyLabel.toLowerCase(),
                })}
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <h4 className="font-medium mb-2">{t("scenarioSummary")}</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">
                  {t("summaryRecurring", { frequency: frequencyLabel })}
                </span>
                <span>
                  {activeRecurringExtras.length > 0
                    ? activeRecurringExtras
                        .map((extra) =>
                          formatCurrency(extra.amount, loan.currency),
                        )
                        .join(" + ")
                    : formatCurrency(0, loan.currency)}
                </span>
                {oneTimePrepayments.length > 0 && (
                  <>
                    <span className="text-muted-foreground">
                      {t("summaryPrepayments")}
                    </span>
                    <span>
                      {t("summaryPrepaymentCount", {
                        count: oneTimePrepayments.length,
                      })}
                    </span>
                  </>
                )}
                <span className="text-muted-foreground">
                  {t("summaryTimeSaved")}
                </span>
                <span>{duration(liveScenario.monthsSaved)}</span>
                <span className="text-muted-foreground">
                  {t("summaryInterestSaved")}
                </span>
                <span className="text-green-600 font-medium">
                  {formatCurrency(liveScenario.interestSaved, loan.currency)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              {tActions("cancel")}
            </Button>
            <Button
              onClick={handleSaveScenario}
              disabled={!scenarioName || isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              )}
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
