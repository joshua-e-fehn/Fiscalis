"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Button } from "@/components/ui/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible";
import { Switch } from "@/components/ui/shadcn/switch";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/shadcn/chart";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";
import {
  TrendingDown,
  Calendar,
  Percent,
  Clock,
  ChevronDown,
  Target,
  CircleDollarSign,
  Plus,
  Trash2,
  Gift,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Calculator,
  GitCompareArrows,
} from "lucide-react";
import { PageHeader } from "@/components/atomic/molecules/investments";
import {
  addMonthsToISODate,
  calculateLoanSchedule,
  getPaymentsPerYear,
  type AmortizationRow,
  type DatedPrepayment,
  type LoanPaymentFrequency,
  type LoanSummary,
  type LoanType,
} from "@/../services/finance/loanScheduleService";
import { todayLocalISO } from "@/lib/utils/date";
import { formatCurrency as formatMoney } from "@/lib/utils/currency";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";

// ============================================================================
// Types
// ============================================================================

// Weekly / bi-weekly schedules aren't offered: the loan engine works in
// calendar months, like the loans users actually track
type PaymentInterval = LoanPaymentFrequency;

interface OneTimeExtraPayment {
  id: string;
  year: number;
  amount: number;
  isPercentage: boolean;
}

interface ExtraPaymentConfig {
  enabled: boolean;
  recurringAmount: number;
  oneTimePayments: OneTimeExtraPayment[];
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Money formatters in the display currency. The calculator's amounts are
 * the user's own input, so they are labelled, never converted.
 */
function useMoneyFormat() {
  const { currency } = useDisplayCurrency();
  return {
    formatCurrency: (value: number) =>
      formatMoney(value, currency, { fractionDigits: 0 }),
    formatCurrencyPrecise: (value: number) => formatMoney(value, currency),
    formatCompact: (value: number) =>
      formatMoney(value, currency, { compact: true }),
  };
}

const PAYMENT_INTERVALS: PaymentInterval[] = [
  "MONTHLY",
  "QUARTERLY",
  "SEMI_ANNUAL",
  "ANNUAL",
];

function PaymentIntervalOptions() {
  const t = useTranslations("calculators.loan.intervals");
  return (
    <>
      {PAYMENT_INTERVALS.map((value) => (
        <SelectItem key={value} value={value}>
          {t(`${value}.label`)}
        </SelectItem>
      ))}
    </>
  );
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ============================================================================
// Loan Type Definitions with Explanations
// ============================================================================

/** The loan types the calculator explains (BULLET is a LoanType too). */
type LoanTypeId = "ANNUITY" | "CONSTANT_PRINCIPAL" | "INTEREST_ONLY" | "BULLET";

interface LoanTypeInfo {
  id: LoanTypeId;
  icon: React.ReactNode;
  color: string;
}

const LOAN_TYPES: LoanTypeInfo[] = [
  {
    id: "ANNUITY",
    icon: <TrendingDown className="h-6 w-6" />,
    color: "bg-blue-500",
  },
  {
    id: "CONSTANT_PRINCIPAL",
    icon: <Target className="h-6 w-6" />,
    color: "bg-green-500",
  },
  {
    id: "INTEREST_ONLY",
    icon: <Clock className="h-6 w-6" />,
    color: "bg-amber-500",
  },
  {
    id: "BULLET",
    icon: <AlertTriangle className="h-6 w-6" />,
    color: "bg-red-500",
  },
];

/** The explanation bullets of a loan type, in the viewer's language. */
function useLoanTypePoints(id: LoanTypeId) {
  const t = useTranslations("calculators.loan.types");
  return {
    howItWorks: [
      t(`${id}.howItWorks1`),
      t(`${id}.howItWorks2`),
      t(`${id}.howItWorks3`),
    ],
    bestFor: [t(`${id}.bestFor1`), t(`${id}.bestFor2`), t(`${id}.bestFor3`)],
    watchOut: [
      t(`${id}.watchOut1`),
      t(`${id}.watchOut2`),
      ...(id === "INTEREST_ONLY" || id === "BULLET"
        ? [t(`${id}.watchOut3`)]
        : []),
    ],
  };
}

// ============================================================================
// Chart Configuration
// ============================================================================

function usePaymentChartConfig(): ChartConfig {
  const t = useTranslations("calculators.loan.charts");
  return {
    principal: {
      label: t("principal"),
      color: "hsl(142, 76%, 36%)",
    },
    interest: {
      label: t("interest"),
      color: "hsl(24, 95%, 53%)",
    },
    balance: {
      label: t("balance"),
      color: "hsl(221, 83%, 53%)",
    },
  };
}

// ============================================================================
// Main Page Component
// ============================================================================

export default function LoanCalculatorPage() {
  const t = useTranslations("calculators.loan");
  const [selectedLoanType, setSelectedLoanType] =
    useState<LoanTypeId>("ANNUITY");
  const selected =
    LOAN_TYPES.find((lt) => lt.id === selectedLoanType) ?? LOAN_TYPES[0];

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Tabs for Calculate and Compare */}
      <Tabs defaultValue="calculate" className="w-full">
        <TabsList className="grid grid-cols-2 mb-8 max-w-md">
          <TabsTrigger value="calculate">
            <Calculator className="w-4 h-4 mr-2" />
            {t("tabs.calculate")}
          </TabsTrigger>
          <TabsTrigger value="compare">
            <GitCompareArrows className="w-4 h-4 mr-2" />
            {t("tabs.compare")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calculate">
          {/* Loan Type Selection */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">{t("chooseType")}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {LOAN_TYPES.map((loanType) => (
                <LoanTypeCard
                  key={loanType.id}
                  loanType={loanType}
                  isSelected={selectedLoanType === loanType.id}
                  onSelect={() => setSelectedLoanType(loanType.id)}
                />
              ))}
            </div>
          </div>

          {/* Loan Type Explanation - Collapsible */}
          <Collapsible className="mb-8">
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                className="w-full flex items-center justify-between"
              >
                <span className="flex items-center gap-2">
                  <HelpCircle className="h-4 w-4" />
                  {t("understanding", {
                    name: t(`types.${selected.id}.name`),
                  })}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <LoanTypeExplanation loanType={selected} />
            </CollapsibleContent>
          </Collapsible>

          {/* Calculator Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              {t("calculateSection")}
            </h2>
            {selectedLoanType === "ANNUITY" && <AnnuityCalculator />}
            {selectedLoanType === "CONSTANT_PRINCIPAL" && (
              <ConstantPrincipalCalculator />
            )}
            {selectedLoanType === "INTEREST_ONLY" && <InterestOnlyCalculator />}
            {selectedLoanType === "BULLET" && <BulletCalculator />}
          </div>
        </TabsContent>

        <TabsContent value="compare">
          <LoanTypeComparison />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ============================================================================
// Loan Type Card Component
// ============================================================================

function LoanTypeCard({
  loanType,
  isSelected,
  onSelect,
}: {
  loanType: LoanTypeInfo;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const t = useTranslations("calculators.loan.types");
  return (
    <Card
      className={`cursor-pointer transition-all hover:shadow-lg ${
        isSelected ? "ring-2 ring-primary shadow-lg" : ""
      }`}
      onClick={onSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${loanType.color} text-white`}>
            {loanType.icon}
          </div>
          <div>
            <CardTitle className="text-lg">
              {t(`${loanType.id}.name`)}
            </CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {t(`${loanType.id}.shortDescription`)}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Loan Type Explanation Component
// ============================================================================

function LoanTypeExplanation({ loanType }: { loanType: LoanTypeInfo }) {
  const t = useTranslations("calculators.loan");
  const points = useLoanTypePoints(loanType.id);
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${loanType.color} text-white`}>
            {loanType.icon}
          </div>
          <div>
            <CardTitle className="text-xl">
              {t(`types.${loanType.id}.name`)}
            </CardTitle>
            <CardDescription>
              {t(`types.${loanType.id}.shortDescription`)}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <HelpCircle className="h-4 w-4 text-blue-500" />
              {t("howItWorks")}
            </h4>
            <ul className="space-y-2">
              {points.howItWorks.map((item, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              {t("bestFor")}
            </h4>
            <ul className="space-y-2">
              {points.bestFor.map((item, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("watchOut")}
            </h4>
            <ul className="space-y-2">
              {points.watchOut.map((item, i) => (
                <li
                  key={i}
                  className="text-sm text-muted-foreground flex items-start gap-2"
                >
                  <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Extra Payments Section Component
// ============================================================================

function ExtraPaymentsSection({
  config,
  setConfig,
  termYears,
  paymentInterval,
}: {
  config: ExtraPaymentConfig;
  setConfig: (config: ExtraPaymentConfig) => void;
  termYears: number;
  paymentInterval: PaymentInterval;
}) {
  const t = useTranslations("calculators.loan");
  const addOneTimePayment = () => {
    setConfig({
      ...config,
      oneTimePayments: [
        ...config.oneTimePayments,
        { id: generateId(), year: 1, amount: 0, isPercentage: false },
      ],
    });
  };

  const removeOneTimePayment = (id: string) => {
    setConfig({
      ...config,
      oneTimePayments: config.oneTimePayments.filter((p) => p.id !== id),
    });
  };

  const updateOneTimePayment = (
    id: string,
    updates: Partial<OneTimeExtraPayment>,
  ) => {
    setConfig({
      ...config,
      oneTimePayments: config.oneTimePayments.map((p) =>
        p.id === id ? { ...p, ...updates } : p,
      ),
    });
  };

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gift className="h-5 w-5 text-green-600" />
          <h4 className="font-semibold">{t("prepayments.title")}</h4>
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="extra-payments-toggle"
            className="text-sm text-muted-foreground"
          >
            {config.enabled
              ? t("prepayments.enabled")
              : t("prepayments.disabled")}
          </Label>
          <Switch
            id="extra-payments-toggle"
            checked={config.enabled}
            onCheckedChange={(checked) =>
              setConfig({ ...config, enabled: checked })
            }
          />
        </div>
      </div>

      {config.enabled && (
        <div className="space-y-4">
          {/* Additional Principal */}
          <div className="space-y-2">
            <Label>{t(`intervals.${paymentInterval}.recurring`)}</Label>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <CircleDollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="number"
                  value={config.recurringAmount}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      recurringAmount: Number(e.target.value),
                    })
                  }
                  className="pl-9"
                  placeholder="0"
                />
              </div>
              <span className="text-sm text-muted-foreground whitespace-nowrap">
                {t(`intervals.${paymentInterval}.perPeriod`)}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("prepayments.recurringHint")}
            </p>
          </div>

          {/* One-Time Prepayments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t("prepayments.oneTime")}</Label>
              <Button variant="outline" size="sm" onClick={addOneTimePayment}>
                <Plus className="h-4 w-4 mr-1" />
                {t("prepayments.add")}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("prepayments.oneTimeHint")}
            </p>

            {config.oneTimePayments.length > 0 && (
              <div className="space-y-2 mt-3">
                {config.oneTimePayments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center gap-2 p-2 bg-background rounded border"
                  >
                    <div className="flex-1 grid grid-cols-3 gap-2 items-center">
                      <div className="flex items-center gap-2">
                        <Label className="text-xs whitespace-nowrap">
                          {t("prepayments.year")}
                        </Label>
                        <Select
                          value={payment.year.toString()}
                          onValueChange={(v) =>
                            updateOneTimePayment(payment.id, {
                              year: Number(v),
                            })
                          }
                        >
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: termYears }, (_, i) => (
                              <SelectItem
                                key={i + 1}
                                value={(i + 1).toString()}
                              >
                                {i + 1}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={payment.amount}
                          onChange={(e) =>
                            updateOneTimePayment(payment.id, {
                              amount: Number(e.target.value),
                            })
                          }
                          className="w-24"
                          placeholder={t("prepayments.amountPlaceholder")}
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <Select
                          value={payment.isPercentage ? "percent" : "fixed"}
                          onValueChange={(v) =>
                            updateOneTimePayment(payment.id, {
                              isPercentage: v === "percent",
                            })
                          }
                        >
                          <SelectTrigger className="w-28">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">
                              {t("prepayments.fixedAmount")}
                            </SelectItem>
                            <SelectItem value="percent">
                              {t("prepayments.percentOfBalance")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOneTimePayment(payment.id)}
                      className="shrink-0"
                      aria-label={t("prepayments.remove")}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Shared Calculator Components
// ============================================================================

function ResultsSummary({
  result,
  resultWithoutExtra,
  principal,
  paymentInterval,
  additionalStats,
}: {
  result: LoanSummary;
  resultWithoutExtra?: LoanSummary;
  principal: number;
  paymentInterval: PaymentInterval;
  additionalStats?: { label: string; value: string; color?: string }[];
}) {
  const t = useTranslations("calculators.loan");
  const { formatCurrency, formatCurrencyPrecise } = useMoneyFormat();
  const hasExtraPayments =
    resultWithoutExtra &&
    resultWithoutExtra.totalInterest !== result.totalInterest;
  const interestSaved = hasExtraPayments
    ? resultWithoutExtra.totalInterest - result.totalInterest
    : 0;
  const periodsSaved = hasExtraPayments
    ? resultWithoutExtra.numberOfPayments - result.numberOfPayments
    : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-muted rounded-lg p-4">
          <div className="text-sm text-muted-foreground">
            {t(`intervals.${paymentInterval}.payment`)}
          </div>
          <div className="text-2xl font-bold">
            {formatCurrencyPrecise(result.typicalPayment)}
          </div>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <div className="text-sm text-muted-foreground">
            {t("summary.totalInterest")}
          </div>
          <div className="text-2xl font-bold text-orange-600">
            {formatCurrency(result.totalInterest)}
          </div>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <div className="text-sm text-muted-foreground">
            {t("summary.totalCost")}
          </div>
          <div className="text-2xl font-bold">
            {formatCurrency(result.totalPayment)}
          </div>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <div className="text-sm text-muted-foreground">
            {t("summary.interestToPrincipal")}
          </div>
          <div className="text-2xl font-bold">
            {((result.totalInterest / principal) * 100).toFixed(0)}%
          </div>
        </div>
        {additionalStats?.map((stat, i) => (
          <div key={i} className="bg-muted rounded-lg p-4">
            <div className="text-sm text-muted-foreground">{stat.label}</div>
            <div className={`text-2xl font-bold ${stat.color || ""}`}>
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {hasExtraPayments && interestSaved > 0 && (
        <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
          <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2 flex items-center gap-2">
            <Gift className="h-5 w-5" />
            {t("summary.savingsTitle")}
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-green-600 dark:text-green-400">
                {t("summary.interestSaved")}
              </div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {formatCurrency(interestSaved)}
              </div>
            </div>
            <div>
              <div className="text-green-600 dark:text-green-400">
                {t("summary.periodsSaved")}
              </div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {t("summary.payments", { count: periodsSaved })}
              </div>
            </div>
            <div>
              <div className="text-green-600 dark:text-green-400">
                {t("summary.originalTerm")}
              </div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {t("summary.payments", {
                  count: resultWithoutExtra.numberOfPayments,
                })}
              </div>
            </div>
            <div>
              <div className="text-green-600 dark:text-green-400">
                {t("summary.newTerm")}
              </div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {t("summary.payments", { count: result.numberOfPayments })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PaymentBreakdownChart({
  schedule,
  paymentInterval,
}: {
  schedule: AmortizationRow[];
  paymentInterval: PaymentInterval;
}) {
  const t = useTranslations("calculators.loan.charts");
  const paymentChartConfig = usePaymentChartConfig();
  const { formatCurrency, formatCompact } = useMoneyFormat();
  const periodsPerYear = getPaymentsPerYear(paymentInterval);

  const yearlyData = useMemo(() => {
    const years: {
      year: number;
      principal: number;
      interest: number;
      balance: number;
    }[] = [];
    let currentYear = 0;
    let yearPrincipal = 0;
    let yearInterest = 0;

    schedule.forEach((row, index) => {
      const rowYear = Math.floor(index / periodsPerYear);
      if (rowYear !== currentYear && index > 0) {
        years.push({
          year: currentYear + 1,
          principal: yearPrincipal,
          interest: yearInterest,
          balance: schedule[index - 1].closingBalance,
        });
        yearPrincipal = 0;
        yearInterest = 0;
        currentYear = rowYear;
      }
      yearPrincipal += row.principalPayment;
      yearInterest += row.interestAmount;
    });

    if (schedule.length > 0) {
      years.push({
        year: currentYear + 1,
        principal: yearPrincipal,
        interest: yearInterest,
        balance: schedule[schedule.length - 1].closingBalance,
      });
    }

    return years;
  }, [schedule, periodsPerYear]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div>
        <h4 className="font-semibold mb-2">{t("breakdownByYear")}</h4>
        <p className="text-sm text-muted-foreground mb-4">
          {t("breakdownHint")}
        </p>
        <ChartContainer config={paymentChartConfig} className="h-[250px]">
          <BarChart data={yearlyData} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="year"
              tickLine={false}
              tickMargin={10}
              tickFormatter={(value) => t("yearTick", { year: value })}
            />
            <YAxis tickFormatter={(value) => formatCompact(value)} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={() => t("payment")}
                  formatter={(value, name, item) => (
                    <div className="flex flex-col gap-1">
                      <span>
                        {t(
                          name === "principal"
                            ? "principalValue"
                            : "interestValue",
                          { amount: formatCurrency(Number(value)) },
                        )}
                      </span>
                      {name === "interest" && (
                        <span className="font-semibold border-t pt-1 mt-1">
                          {t("totalValue", {
                            amount: formatCurrency(
                              item.payload.principal + item.payload.interest,
                            ),
                          })}
                        </span>
                      )}
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="principal"
              stackId="a"
              fill="var(--color-principal)"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="interest"
              stackId="a"
              fill="var(--color-interest)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>

      <div>
        <h4 className="font-semibold mb-2">{t("balanceOverTime")}</h4>
        <p className="text-sm text-muted-foreground mb-4">{t("balanceHint")}</p>
        <ChartContainer config={paymentChartConfig} className="h-[250px]">
          <AreaChart data={yearlyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="year"
              tickLine={false}
              tickMargin={10}
              tickFormatter={(value) => t("yearTick", { year: value })}
            />
            <YAxis tickFormatter={(value) => formatCompact(value)} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span>
                      {t("balanceValue", {
                        amount: formatCurrency(Number(value)),
                      })}
                    </span>
                  )}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="balance"
              fill="var(--color-balance)"
              fillOpacity={0.3}
              stroke="var(--color-balance)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </div>
    </div>
  );
}

function LoanTypeChartsCard({
  title,
  schedule,
  paymentInterval,
  color,
}: {
  title: string;
  schedule: AmortizationRow[];
  paymentInterval: PaymentInterval;
  color: "blue" | "green" | "amber" | "red";
}) {
  const t = useTranslations("calculators.loan.charts");
  const paymentChartConfig = usePaymentChartConfig();
  const { formatCurrency, formatCompact } = useMoneyFormat();
  const periodsPerYear = getPaymentsPerYear(paymentInterval);

  const yearlyData = useMemo(() => {
    const years: {
      year: number;
      principal: number;
      interest: number;
      balance: number;
    }[] = [];
    let currentYear = 0;
    let yearPrincipal = 0;
    let yearInterest = 0;

    schedule.forEach((row, index) => {
      const rowYear = Math.floor(index / periodsPerYear);
      if (rowYear !== currentYear && index > 0) {
        years.push({
          year: currentYear + 1,
          principal: yearPrincipal,
          interest: yearInterest,
          balance: schedule[index - 1].closingBalance,
        });
        yearPrincipal = 0;
        yearInterest = 0;
        currentYear = rowYear;
      }
      yearPrincipal += row.principalPayment;
      yearInterest += row.interestAmount;
    });

    if (schedule.length > 0) {
      years.push({
        year: currentYear + 1,
        principal: yearPrincipal,
        interest: yearInterest,
        balance: schedule[schedule.length - 1].closingBalance,
      });
    }

    return years;
  }, [schedule, periodsPerYear]);

  const colorClasses = {
    blue: "border-blue-200 dark:border-blue-900",
    green: "border-green-200 dark:border-green-900",
    amber: "border-amber-200 dark:border-amber-900",
    red: "border-red-200 dark:border-red-900",
  };

  const areaColors = {
    blue: "hsl(221, 83%, 53%)",
    green: "hsl(142, 76%, 36%)",
    amber: "hsl(38, 92%, 50%)",
    red: "hsl(0, 72%, 51%)",
  };

  return (
    <div className={`border rounded-lg p-4 ${colorClasses[color]}`}>
      <h5 className="font-medium mb-4">{title}</h5>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Payment Breakdown Chart */}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-2">{t("breakdown")}</p>
          <ChartContainer
            config={paymentChartConfig}
            className="h-[160px] w-full"
          >
            <BarChart data={yearlyData} stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="year"
                tickLine={false}
                tickMargin={10}
                tickFormatter={(value) => t("yearTick", { year: value })}
                fontSize={10}
              />
              <YAxis
                tickFormatter={(value) => formatCompact(value)}
                fontSize={10}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={() => t("payment")}
                    formatter={(value, name, item) => (
                      <div className="flex flex-col gap-1">
                        <span>
                          {t(
                            name === "principal"
                              ? "principalValue"
                              : "interestValue",
                            { amount: formatCurrency(Number(value)) },
                          )}
                        </span>
                        {name === "interest" && (
                          <span className="font-semibold border-t pt-1 mt-1">
                            {t("totalValue", {
                              amount: formatCurrency(
                                item.payload.principal + item.payload.interest,
                              ),
                            })}
                          </span>
                        )}
                      </div>
                    )}
                  />
                }
              />
              <Bar
                dataKey="principal"
                stackId="a"
                fill="var(--color-principal)"
                radius={[0, 0, 0, 0]}
              />
              <Bar
                dataKey="interest"
                stackId="a"
                fill="var(--color-interest)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ChartContainer>
        </div>

        {/* Remaining Balance Chart */}
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground mb-2">{t("balance")}</p>
          <ChartContainer
            config={paymentChartConfig}
            className="h-[160px] w-full"
          >
            <AreaChart data={yearlyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="year"
                tickLine={false}
                tickMargin={10}
                tickFormatter={(value) => t("yearTick", { year: value })}
                fontSize={10}
              />
              <YAxis
                tickFormatter={(value) => formatCompact(value)}
                fontSize={10}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span>
                        {t("balanceValue", {
                          amount: formatCurrency(Number(value)),
                        })}
                      </span>
                    )}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="balance"
                fill={areaColors[color]}
                fillOpacity={0.3}
                stroke={areaColors[color]}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}

function AmortizationTable({ schedule }: { schedule: AmortizationRow[] }) {
  const t = useTranslations("calculators.loan.schedule");
  const { formatCurrencyPrecise } = useMoneyFormat();
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll ? schedule : schedule.slice(0, 12);

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full mb-4">
          <ChevronDown className="h-4 w-4 mr-2" />
          {t("view")}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("period")}</TableHead>
                <TableHead className="text-right">{t("payment")}</TableHead>
                <TableHead className="text-right">{t("principal")}</TableHead>
                <TableHead className="text-right">{t("interest")}</TableHead>
                <TableHead className="text-right">{t("extra")}</TableHead>
                <TableHead className="text-right">{t("balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayRows.map((row) => (
                <TableRow key={row.periodIndex}>
                  <TableCell>{row.periodIndex}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyPrecise(row.totalPayment)}
                  </TableCell>
                  <TableCell className="text-right text-green-600">
                    {formatCurrencyPrecise(row.principalPayment)}
                  </TableCell>
                  <TableCell className="text-right text-orange-600">
                    {formatCurrencyPrecise(row.interestAmount)}
                  </TableCell>
                  <TableCell className="text-right text-purple-600">
                    {row.prepaymentAmount > 0
                      ? formatCurrencyPrecise(row.prepaymentAmount)
                      : "-"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrencyPrecise(row.closingBalance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!showAll && schedule.length > 12 && (
            <div className="p-4 text-center border-t">
              <Button variant="ghost" onClick={() => setShowAll(true)}>
                {t("showAll", { count: schedule.length })}
              </Button>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ============================================================================
// Helper to build Prepayments from config
// ============================================================================

function buildPrepayments(
  config: ExtraPaymentConfig,
  principal: number,
  termYears: number,
  startDate: string,
): { prepayments: DatedPrepayment[]; extraPerPeriod: number } {
  if (!config.enabled) return { prepayments: [], extraPerPeriod: 0 };

  // One-time payments at the end of the specified year
  const prepayments = config.oneTimePayments
    .filter((payment) => payment.amount > 0 && payment.year <= termYears)
    .map((payment) => ({
      date: addMonthsToISODate(startDate, payment.year * 12),
      // Percentages are of the initial principal
      amount: payment.isPercentage
        ? (principal * payment.amount) / 100
        : payment.amount,
    }));

  return { prepayments, extraPerPeriod: Math.max(0, config.recurringAmount) };
}

// ============================================================================
// Generic Loan Calculator (used by all types)
// ============================================================================

function GenericLoanCalculator({
  loanType,
  title,
  description,
  showGracePeriod,
  defaultTermYears = 30,
  defaultPrincipal = 250000,
  renderAdditionalInputs,
  renderAdditionalResults,
  renderWarnings,
}: {
  loanType: LoanType;
  title: string;
  description: string;
  showGracePeriod?: boolean;
  defaultTermYears?: number;
  defaultPrincipal?: number;
  renderAdditionalInputs?: (props: {
    gracePeriodYears: number;
    setGracePeriodYears: (v: number) => void;
    termYears: number;
  }) => React.ReactNode;
  renderAdditionalResults?: (props: {
    result: LoanSummary;
    principal: number;
    interestRate: number;
    gracePeriodYears: number;
    paymentInterval: PaymentInterval;
  }) => React.ReactNode;
  renderWarnings?: (props: {
    result: LoanSummary;
    principal: number;
    interestRate: number;
    gracePeriodYears: number;
    paymentInterval: PaymentInterval;
    termYears: number;
  }) => React.ReactNode;
}) {
  const t = useTranslations("calculators.loan");
  const [principal, setPrincipal] = useState(defaultPrincipal);
  const [interestRate, setInterestRate] = useState(6.5);
  const [termYears, setTermYears] = useState(defaultTermYears);
  const [paymentInterval, setPaymentInterval] =
    useState<PaymentInterval>("MONTHLY");
  const [gracePeriodYears, setGracePeriodYears] = useState(5);
  const [extraPaymentConfig, setExtraPaymentConfig] =
    useState<ExtraPaymentConfig>({
      enabled: false,
      recurringAmount: 0,
      oneTimePayments: [],
    });
  const [result, setResult] = useState<LoanSummary | null>(null);
  const [resultWithoutExtra, setResultWithoutExtra] =
    useState<LoanSummary | null>(null);

  function calculate() {
    const periodsPerYear = getPaymentsPerYear(paymentInterval);
    const startDate = todayLocalISO();

    const baseInput = {
      loanType,
      principal,
      annualInterestRate: interestRate / 100,
      termPeriods: termYears * periodsPerYear,
      paymentFrequency: paymentInterval,
      startDate,
      ...(showGracePeriod && {
        gracePeriods: gracePeriodYears * periodsPerYear,
      }),
    };

    // Calculate without extra payments
    const withoutExtra = calculateLoanSchedule(baseInput);
    setResultWithoutExtra(withoutExtra);

    // Calculate with extra payments
    const withExtra = calculateLoanSchedule({
      ...baseInput,
      ...buildPrepayments(extraPaymentConfig, principal, termYears, startDate),
    });
    setResult(withExtra);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Main Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="principal">{t("fields.loanAmount")}</Label>
              <div className="relative">
                <CircleDollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="principal"
                  type="number"
                  value={principal}
                  onChange={(e) => setPrincipal(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="interest-rate">
                {t("fields.annualInterestRate")}
              </Label>
              <div className="relative">
                <Percent className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="interest-rate"
                  type="number"
                  step="0.1"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="term-years">{t("fields.termYears")}</Label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="term-years"
                  type="number"
                  value={termYears}
                  onChange={(e) => setTermYears(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment-interval">
                {t("fields.paymentSchedule")}
              </Label>
              <Select
                value={paymentInterval}
                onValueChange={(v) => setPaymentInterval(v as PaymentInterval)}
              >
                <SelectTrigger>
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <PaymentIntervalOptions />
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Additional Inputs (grace period, etc.) */}
          {renderAdditionalInputs?.({
            gracePeriodYears,
            setGracePeriodYears,
            termYears,
          })}

          {/* Extra Payments Section */}
          <ExtraPaymentsSection
            config={extraPaymentConfig}
            setConfig={setExtraPaymentConfig}
            termYears={termYears}
            paymentInterval={paymentInterval}
          />

          <Button onClick={calculate} size="lg" className="w-full md:w-auto">
            {t("calculate")}
          </Button>
        </div>

        {result && (
          <div className="mt-8 space-y-6">
            <h3 className="text-lg font-semibold">{t("yourResults")}</h3>

            {/* Warnings */}
            {renderWarnings?.({
              result,
              principal,
              interestRate,
              gracePeriodYears,
              paymentInterval,
              termYears,
            })}

            {/* Additional Results */}
            {renderAdditionalResults?.({
              result,
              principal,
              interestRate,
              gracePeriodYears,
              paymentInterval,
            })}

            <ResultsSummary
              result={result}
              resultWithoutExtra={resultWithoutExtra ?? undefined}
              principal={principal}
              paymentInterval={paymentInterval}
            />

            <PaymentBreakdownChart
              schedule={result.schedule}
              paymentInterval={paymentInterval}
            />

            <AmortizationTable schedule={result.schedule} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Specific Loan Calculators
// ============================================================================

function AnnuityCalculator() {
  const t = useTranslations("calculators.loan.types.ANNUITY");
  return (
    <GenericLoanCalculator
      loanType="ANNUITY"
      title={t("calculatorTitle")}
      description={t("calculatorDescription")}
    />
  );
}

function ConstantPrincipalCalculator() {
  const t = useTranslations("calculators.loan");
  const { formatCurrencyPrecise } = useMoneyFormat();
  return (
    <GenericLoanCalculator
      loanType="CONSTANT_PRINCIPAL"
      title={t("types.CONSTANT_PRINCIPAL.calculatorTitle")}
      description={t("types.CONSTANT_PRINCIPAL.calculatorDescription")}
      renderAdditionalResults={({ result }) => {
        const firstPayment = result.schedule[0]?.totalPayment ?? 0;
        const lastPayment =
          result.schedule[result.schedule.length - 1]?.totalPayment ?? 0;

        return (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
              {t("warnings.savingsTitle")}
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              {t("warnings.savingsBody", {
                first: formatCurrencyPrecise(firstPayment),
                last: formatCurrencyPrecise(lastPayment),
                difference: formatCurrencyPrecise(firstPayment - lastPayment),
              })}
            </p>
          </div>
        );
      }}
    />
  );
}

function InterestOnlyCalculator() {
  const t = useTranslations("calculators.loan");
  const { formatCurrencyPrecise } = useMoneyFormat();
  return (
    <GenericLoanCalculator
      loanType="INTEREST_ONLY_THEN"
      title={t("types.INTEREST_ONLY.calculatorTitle")}
      description={t("types.INTEREST_ONLY.calculatorDescription")}
      showGracePeriod
      renderAdditionalInputs={({
        gracePeriodYears,
        setGracePeriodYears,
        termYears,
      }) => (
        <div className="space-y-2">
          <Label htmlFor="interest-only-years">
            {t("fields.interestOnlyYears")}
          </Label>
          <div className="relative max-w-xs">
            <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              id="interest-only-years"
              type="number"
              value={gracePeriodYears}
              onChange={(e) => setGracePeriodYears(Number(e.target.value))}
              className="pl-9"
              max={termYears - 1}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            {t("fields.interestOnlyHint")}
          </p>
        </div>
      )}
      renderWarnings={({
        result,
        principal,
        interestRate,
        gracePeriodYears,
        paymentInterval,
      }) => {
        const periodsPerYear = getPaymentsPerYear(paymentInterval);
        const interestOnlyPayment =
          (principal * (interestRate / 100)) / periodsPerYear;
        const afterGraceIndex = gracePeriodYears * periodsPerYear;
        const afterGracePayment =
          result.schedule[afterGraceIndex]?.scheduledPayment ?? 0;

        if (afterGracePayment <= interestOnlyPayment) return null;

        return (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
            <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
              {t("warnings.shockTitle")}
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              {t("warnings.shockBody", {
                years: gracePeriodYears,
                from: formatCurrencyPrecise(interestOnlyPayment),
                to: formatCurrencyPrecise(afterGracePayment),
                difference: formatCurrencyPrecise(
                  afterGracePayment - interestOnlyPayment,
                ),
                percent: (
                  (afterGracePayment / interestOnlyPayment - 1) *
                  100
                ).toFixed(0),
              })}
            </p>
          </div>
        );
      }}
    />
  );
}

function BulletCalculator() {
  const t = useTranslations("calculators.loan");
  const { formatCurrency } = useMoneyFormat();
  return (
    <GenericLoanCalculator
      loanType="BULLET"
      title={t("types.BULLET.calculatorTitle")}
      description={t("types.BULLET.calculatorDescription")}
      defaultTermYears={5}
      defaultPrincipal={100000}
      renderWarnings={({ principal, termYears }) => (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
          <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">
            {t("warnings.balloonTitle")}
          </h4>
          <p className="text-sm text-red-700 dark:text-red-300 mb-2">
            {t("warnings.balloonBody", {
              years: termYears,
              amount: formatCurrency(principal),
            })}
          </p>
          <p className="text-sm text-red-700 dark:text-red-300">
            {t.rich("warnings.balloonOptions", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>
        </div>
      )}
    />
  );
}

// ============================================================================
// Loan Type Comparison
// ============================================================================

function LoanTypeComparison() {
  const t = useTranslations("calculators.loan");
  const paymentChartConfig = usePaymentChartConfig();
  const { formatCurrency, formatCurrencyPrecise, formatCompact } =
    useMoneyFormat();
  const [principal, setPrincipal] = useState(250000);
  const [interestRate, setInterestRate] = useState(6.5);
  const [termYears, setTermYears] = useState(30);
  const [paymentInterval, setPaymentInterval] =
    useState<PaymentInterval>("MONTHLY");
  const [results, setResults] = useState<{
    annuity: LoanSummary;
    constantPrincipal: LoanSummary;
    interestOnly: LoanSummary;
    bullet: LoanSummary;
  } | null>(null);

  function calculateAll() {
    const periodsPerYear = getPaymentsPerYear(paymentInterval);

    const baseInput = {
      principal,
      annualInterestRate: interestRate / 100,
      termPeriods: termYears * periodsPerYear,
      paymentFrequency: paymentInterval,
      startDate: todayLocalISO(),
    };
    const gracePeriods = 5 * periodsPerYear;

    setResults({
      annuity: calculateLoanSchedule({ ...baseInput, loanType: "ANNUITY" }),
      constantPrincipal: calculateLoanSchedule({
        ...baseInput,
        loanType: "CONSTANT_PRINCIPAL",
      }),
      interestOnly: calculateLoanSchedule({
        ...baseInput,
        loanType: "INTEREST_ONLY_THEN",
        gracePeriods,
      }),
      bullet: calculateLoanSchedule({ ...baseInput, loanType: "BULLET" }),
    });
  }

  const comparisonData = results
    ? [
        {
          id: "ANNUITY",
          type: t("types.ANNUITY.shortName"),
          payment: results.annuity.typicalPayment,
          interest: results.annuity.totalInterest,
          total: results.annuity.totalPayment,
        },
        {
          id: "CONSTANT_PRINCIPAL",
          type: t("types.CONSTANT_PRINCIPAL.shortName"),
          payment: results.constantPrincipal.schedule[0]?.totalPayment ?? 0,
          interest: results.constantPrincipal.totalInterest,
          total: results.constantPrincipal.totalPayment,
        },
        {
          id: "INTEREST_ONLY",
          type: t("types.INTEREST_ONLY.shortName"),
          payment: results.interestOnly.schedule[0]?.totalPayment ?? 0,
          interest: results.interestOnly.totalInterest,
          total: results.interestOnly.totalPayment,
        },
        {
          id: "BULLET",
          type: t("types.BULLET.shortName"),
          payment: results.bullet.schedule[0]?.totalPayment ?? 0,
          interest: results.bullet.totalInterest,
          total: results.bullet.totalPayment,
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("compare.title")}</CardTitle>
        <CardDescription>{t("compare.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="space-y-2">
            <Label>{t("fields.loanAmount")}</Label>
            <Input
              type="number"
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("fields.interestRate")}</Label>
            <Input
              type="number"
              step="0.1"
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("fields.termYearsShort")}</Label>
            <Input
              type="number"
              value={termYears}
              onChange={(e) => setTermYears(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("fields.paymentSchedule")}</Label>
            <Select
              value={paymentInterval}
              onValueChange={(v) => setPaymentInterval(v as PaymentInterval)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <PaymentIntervalOptions />
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={calculateAll} className="mb-6">
          {t("compare.button")}
        </Button>

        {results && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("compare.loanType")}</TableHead>
                      <TableHead className="text-right">
                        {t("compare.firstPayment")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("compare.totalInterest")}
                      </TableHead>
                      <TableHead className="text-right">
                        {t("compare.totalCost")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonData.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">
                          {row.type}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrencyPrecise(row.payment)}
                        </TableCell>
                        <TableCell className="text-right text-orange-600">
                          {formatCurrency(row.interest)}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatCurrency(row.total)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="pr-4">
                <h4 className="font-semibold mb-2">
                  {t("compare.interestChart")}
                </h4>
                <ChartContainer
                  config={paymentChartConfig}
                  className="h-[180px] w-full"
                >
                  <BarChart data={comparisonData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => formatCompact(v)}
                    />
                    <YAxis type="category" dataKey="type" width={120} />
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          formatter={(v) => formatCurrency(Number(v))}
                        />
                      }
                    />
                    <Bar
                      dataKey="interest"
                      fill="var(--color-interest)"
                      radius={4}
                    />
                  </BarChart>
                </ChartContainer>
              </div>
            </div>

            {/* Charts per Loan Type */}
            <div className="mt-6">
              <h4 className="font-semibold mb-4">{t("compare.byType")}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <LoanTypeChartsCard
                  title={t("types.ANNUITY.shortName")}
                  schedule={results.annuity.schedule}
                  paymentInterval={paymentInterval}
                  color="blue"
                />
                <LoanTypeChartsCard
                  title={t("types.CONSTANT_PRINCIPAL.shortName")}
                  schedule={results.constantPrincipal.schedule}
                  paymentInterval={paymentInterval}
                  color="green"
                />
                <LoanTypeChartsCard
                  title={t("types.INTEREST_ONLY.shortName")}
                  schedule={results.interestOnly.schedule}
                  paymentInterval={paymentInterval}
                  color="amber"
                />
                <LoanTypeChartsCard
                  title={t("types.BULLET.shortName")}
                  schedule={results.bullet.schedule}
                  paymentInterval={paymentInterval}
                  color="red"
                />
              </div>
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">
                {t("compare.insightTitle")}
              </h4>
              <p className="text-sm text-muted-foreground">
                {t.rich("compare.insightBody", {
                  strong: (chunks) => <strong>{chunks}</strong>,
                  saved: formatCurrency(
                    results.annuity.totalInterest -
                      results.constantPrincipal.totalInterest,
                  ),
                  extra: formatCurrency(
                    (results.constantPrincipal.schedule[0]?.totalPayment ?? 0) -
                      results.annuity.typicalPayment,
                  ),
                })}
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
