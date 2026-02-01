"use client";

import { useState, useMemo } from "react";
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
import { Badge } from "@/components/ui/shadcn/badge";
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
  HandCoins,
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
import {
  calculateLoanSchedule,
  LoanPaymentInterval,
  LoanSummary,
  AmortizationRow,
  Prepayment,
  LoanType,
} from "@/../services/finance/financeService";

// ============================================================================
// Types
// ============================================================================

type ExtendedPaymentInterval = LoanPaymentInterval | "week" | "biweekly";

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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyPrecise(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function getPeriodsPerYear(interval: ExtendedPaymentInterval): number {
  switch (interval) {
    case "week":
      return 52;
    case "biweekly":
      return 26;
    case "month":
      return 12;
    case "quarter":
      return 4;
    case "year":
      return 1;
  }
}

function getIntervalLabel(interval: ExtendedPaymentInterval): string {
  switch (interval) {
    case "week":
      return "Weekly";
    case "biweekly":
      return "Bi-weekly";
    case "month":
      return "Monthly";
    case "quarter":
      return "Quarterly";
    case "year":
      return "Yearly";
  }
}

function getPaymentLabel(interval: ExtendedPaymentInterval): string {
  switch (interval) {
    case "week":
      return "Weekly Payment";
    case "biweekly":
      return "Bi-weekly Payment";
    case "month":
      return "Monthly Payment";
    case "quarter":
      return "Quarterly Payment";
    case "year":
      return "Yearly Payment";
  }
}

// Convert extended interval to supported LoanPaymentInterval
function toServiceInterval(
  interval: ExtendedPaymentInterval,
): LoanPaymentInterval {
  // For weekly/biweekly, we'll use monthly and adjust the periods
  if (interval === "week" || interval === "biweekly") {
    return "month";
  }
  return interval;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

// ============================================================================
// Loan Type Definitions with Explanations
// ============================================================================

interface LoanTypeInfo {
  id: LoanType | "INTEREST_ONLY" | "BULLET";
  name: string;
  shortDescription: string;
  howItWorks: string[];
  bestFor: string[];
  watchOut: string[];
  icon: React.ReactNode;
  color: string;
}

const LOAN_TYPES: LoanTypeInfo[] = [
  {
    id: "ANNUITY",
    name: "Fixed Payment Loan",
    shortDescription: "Same payment every period, most common type",
    howItWorks: [
      "You pay the same amount every period for the entire loan term",
      "Early payments are mostly interest, later payments are mostly principal",
      "The total debt decreases steadily over time",
    ],
    bestFor: [
      "Homebuyers who want predictable budgets",
      "Long-term loans (15-30 years)",
      "People who prefer stability over flexibility",
    ],
    watchOut: [
      "You pay more interest in the early years",
      "Less flexibility if your income changes",
    ],
    icon: <TrendingDown className="h-6 w-6" />,
    color: "bg-blue-500",
  },
  {
    id: "CONSTANT_PRINCIPAL",
    name: "Declining Payment Loan",
    shortDescription: "Payments start high and decrease over time",
    howItWorks: [
      "You pay a fixed amount of principal each period, plus interest",
      "As the debt decreases, so does the interest, making payments smaller",
      "Total interest paid is less than a fixed payment loan",
    ],
    bestFor: [
      "People expecting lower income later (near retirement)",
      "Those who can afford higher initial payments",
      "Borrowers who want to minimize total interest paid",
    ],
    watchOut: [
      "Initial payments can be 20-30% higher than fixed payment loans",
      "May not qualify if income barely covers the first payment",
    ],
    icon: <Target className="h-6 w-6" />,
    color: "bg-green-500",
  },
  {
    id: "INTEREST_ONLY",
    name: "Interest-Only Loan",
    shortDescription: "Pay only interest, then principal later",
    howItWorks: [
      "For a set period, you only pay interest - the debt doesn't decrease",
      "After the interest-only period, you start paying principal too",
      "Payments jump significantly when the principal payments begin",
    ],
    bestFor: [
      "Real estate investors expecting to sell before principal payments start",
      "People expecting higher income in the future",
      "Short-term financing needs",
    ],
    watchOut: [
      "You build no equity during the interest-only period",
      "Payment shock when regular payments begin",
      "Risk of owing more than the asset is worth",
    ],
    icon: <Clock className="h-6 w-6" />,
    color: "bg-amber-500",
  },
  {
    id: "BULLET",
    name: "Balloon / Bullet Loan",
    shortDescription: "Pay interest only, entire principal due at end",
    howItWorks: [
      "You pay only interest throughout the entire loan term",
      "The full principal amount is due as one lump sum at the end",
      "Periodic payments are very low, but you need a plan for the final payment",
    ],
    bestFor: [
      "Bridge financing (short-term loans until permanent financing is arranged)",
      "Investors planning to sell the asset before the loan matures",
      "Construction loans or development projects",
    ],
    watchOut: [
      "High risk - you must have a plan to pay off or refinance",
      "If you can't pay the balloon, you could lose the asset",
      "No equity built during the loan term",
    ],
    icon: <AlertTriangle className="h-6 w-6" />,
    color: "bg-red-500",
  },
];

// ============================================================================
// Chart Configuration
// ============================================================================

const paymentChartConfig: ChartConfig = {
  principal: {
    label: "Principal",
    color: "hsl(142, 76%, 36%)",
  },
  interest: {
    label: "Interest",
    color: "hsl(24, 95%, 53%)",
  },
  balance: {
    label: "Remaining Balance",
    color: "hsl(221, 83%, 53%)",
  },
};

// ============================================================================
// Main Page Component
// ============================================================================

export default function LoanCalculatorPage() {
  const [selectedLoanType, setSelectedLoanType] = useState<string>("ANNUITY");

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="text-center mb-12">
        <div className="flex items-center justify-center gap-3 mb-4">
          <HandCoins className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold">Loan Calculator</h1>
        </div>
        <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
          Understand different loan types, visualize your payments, and find the
          best option for your situation. We&apos;ll show you exactly where your
          money goes.
        </p>
      </div>

      {/* Tabs for Calculate and Compare */}
      <Tabs defaultValue="calculate" className="w-full">
        <TabsList className="grid grid-cols-2 mb-8 max-w-md mx-auto">
          <TabsTrigger value="calculate">
            <Calculator className="w-4 h-4 mr-2" />
            Calculate Loan
          </TabsTrigger>
          <TabsTrigger value="compare">
            <GitCompareArrows className="w-4 h-4 mr-2" />
            Compare All Types
          </TabsTrigger>
        </TabsList>

        <TabsContent value="calculate">
          {/* Loan Type Selection */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              1. Choose Your Loan Type
            </h2>
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
                  Understanding{" "}
                  {LOAN_TYPES.find((lt) => lt.id === selectedLoanType)?.name}
                </span>
                <ChevronDown className="h-4 w-4" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4">
              <LoanTypeExplanation
                loanType={LOAN_TYPES.find((lt) => lt.id === selectedLoanType)!}
              />
            </CollapsibleContent>
          </Collapsible>

          {/* Calculator Section */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">
              2. Calculate Your Loan
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
            <CardTitle className="text-lg">{loanType.name}</CardTitle>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {loanType.shortDescription}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// Loan Type Explanation Component
// ============================================================================

function LoanTypeExplanation({ loanType }: { loanType: LoanTypeInfo }) {
  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${loanType.color} text-white`}>
            {loanType.icon}
          </div>
          <div>
            <CardTitle className="text-xl">{loanType.name}</CardTitle>
            <CardDescription>{loanType.shortDescription}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <h4 className="font-semibold flex items-center gap-2 mb-2">
              <HelpCircle className="h-4 w-4 text-blue-500" />
              How It Works
            </h4>
            <ul className="space-y-2">
              {loanType.howItWorks.map((item, i) => (
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
              Best For
            </h4>
            <ul className="space-y-2">
              {loanType.bestFor.map((item, i) => (
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
              Watch Out For
            </h4>
            <ul className="space-y-2">
              {loanType.watchOut.map((item, i) => (
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
  principal,
  paymentInterval,
}: {
  config: ExtraPaymentConfig;
  setConfig: (config: ExtraPaymentConfig) => void;
  termYears: number;
  principal: number;
  paymentInterval: ExtendedPaymentInterval;
}) {
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
          <h4 className="font-semibold">Prepayments</h4>
        </div>
        <div className="flex items-center gap-2">
          <Label
            htmlFor="extra-payments-toggle"
            className="text-sm text-muted-foreground"
          >
            {config.enabled ? "Enabled" : "Disabled"}
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
            <Label>
              Additional Principal (every{" "}
              {getIntervalLabel(paymentInterval).toLowerCase()})
            </Label>
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
                per{" "}
                {paymentInterval === "biweekly" ? "bi-week" : paymentInterval}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              This amount will be added to every regular payment.
            </p>
          </div>

          {/* One-Time Prepayments */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>One-Time Prepayments</Label>
              <Button variant="outline" size="sm" onClick={addOneTimePayment}>
                <Plus className="h-4 w-4 mr-1" />
                Add Prepayment
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Schedule specific prepayments in certain years (e.g., yearly
              bonus, inheritance).
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
                          Year
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
                          placeholder="Amount"
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
                            <SelectItem value="fixed">$ Fixed</SelectItem>
                            <SelectItem value="percent">
                              % of Balance
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
  paymentInterval: ExtendedPaymentInterval;
  additionalStats?: { label: string; value: string; color?: string }[];
}) {
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
            {getPaymentLabel(paymentInterval)}
          </div>
          <div className="text-2xl font-bold">
            {formatCurrencyPrecise(result.typicalPayment)}
          </div>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Interest</div>
          <div className="text-2xl font-bold text-orange-600">
            {formatCurrency(result.totalInterest)}
          </div>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <div className="text-sm text-muted-foreground">Total Cost</div>
          <div className="text-2xl font-bold">
            {formatCurrency(result.totalPayment)}
          </div>
        </div>
        <div className="bg-muted rounded-lg p-4">
          <div className="text-sm text-muted-foreground">
            Interest / Principal
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
            Prepayment Savings
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-green-600 dark:text-green-400">
                Interest Saved
              </div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {formatCurrency(interestSaved)}
              </div>
            </div>
            <div>
              <div className="text-green-600 dark:text-green-400">
                Periods Saved
              </div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {periodsSaved} payments
              </div>
            </div>
            <div>
              <div className="text-green-600 dark:text-green-400">
                Original Term
              </div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {resultWithoutExtra.numberOfPayments} payments
              </div>
            </div>
            <div>
              <div className="text-green-600 dark:text-green-400">New Term</div>
              <div className="text-lg font-bold text-green-700 dark:text-green-300">
                {result.numberOfPayments} payments
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
  paymentInterval: ExtendedPaymentInterval;
}) {
  const periodsPerYear = getPeriodsPerYear(paymentInterval);

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
        <h4 className="font-semibold mb-2">Payment Breakdown by Year</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Principal (green) vs interest (orange) over time.
        </p>
        <ChartContainer config={paymentChartConfig} className="h-[250px]">
          <BarChart data={yearlyData} stackOffset="sign">
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="year"
              tickLine={false}
              tickMargin={10}
              tickFormatter={(value) => `Y${value}`}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={() => "Payment"}
                  formatter={(value, name, item) => (
                    <div className="flex flex-col gap-1">
                      <span>
                        {name === "principal" ? "Principal" : "Interest"}:{" "}
                        {formatCurrency(Number(value))}
                      </span>
                      {name === "interest" && (
                        <span className="font-semibold border-t pt-1 mt-1">
                          Total:{" "}
                          {formatCurrency(
                            item.payload.principal + item.payload.interest,
                          )}
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
        <h4 className="font-semibold mb-2">Remaining Balance Over Time</h4>
        <p className="text-sm text-muted-foreground mb-4">
          Watch your debt decrease as you make payments.
        </p>
        <ChartContainer config={paymentChartConfig} className="h-[250px]">
          <AreaChart data={yearlyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="year"
              tickLine={false}
              tickMargin={10}
              tickFormatter={(value) => `Y${value}`}
            />
            <YAxis
              tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => (
                    <span>Balance: {formatCurrency(Number(value))}</span>
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
  paymentInterval: ExtendedPaymentInterval;
  color: "blue" | "green" | "amber" | "red";
}) {
  const periodsPerYear = getPeriodsPerYear(paymentInterval);

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
          <p className="text-xs text-muted-foreground mb-2">
            Payment Breakdown
          </p>
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
                tickFormatter={(value) => `Y${value}`}
                fontSize={10}
              />
              <YAxis
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                fontSize={10}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={() => "Payment"}
                    formatter={(value, name, item) => (
                      <div className="flex flex-col gap-1">
                        <span>
                          {name === "principal" ? "Principal" : "Interest"}:{" "}
                          {formatCurrency(Number(value))}
                        </span>
                        {name === "interest" && (
                          <span className="font-semibold border-t pt-1 mt-1">
                            Total:{" "}
                            {formatCurrency(
                              item.payload.principal + item.payload.interest,
                            )}
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
          <p className="text-xs text-muted-foreground mb-2">
            Remaining Balance
          </p>
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
                tickFormatter={(value) => `Y${value}`}
                fontSize={10}
              />
              <YAxis
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
                fontSize={10}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    formatter={(value) => (
                      <span>Balance: {formatCurrency(Number(value))}</span>
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
  const [showAll, setShowAll] = useState(false);
  const displayRows = showAll ? schedule : schedule.slice(0, 12);

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="w-full mb-4">
          <ChevronDown className="h-4 w-4 mr-2" />
          View Full Payment Schedule
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead className="text-right">Payment</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Interest</TableHead>
                <TableHead className="text-right">Extra</TableHead>
                <TableHead className="text-right">Balance</TableHead>
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
                Show all {schedule.length} payments
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
  paymentInterval: ExtendedPaymentInterval,
  startDate: Date,
): Prepayment[] {
  if (!config.enabled) return [];

  const payments: Prepayment[] = [];
  const periodsPerYear = getPeriodsPerYear(paymentInterval);
  const totalPeriods = termYears * periodsPerYear;

  // Add recurring payments
  if (config.recurringAmount > 0) {
    for (let i = 1; i <= totalPeriods; i++) {
      const paymentDate = new Date(startDate);
      if (paymentInterval === "week") {
        paymentDate.setDate(paymentDate.getDate() + i * 7);
      } else if (paymentInterval === "biweekly") {
        paymentDate.setDate(paymentDate.getDate() + i * 14);
      } else if (paymentInterval === "month") {
        paymentDate.setMonth(paymentDate.getMonth() + i);
      } else if (paymentInterval === "quarter") {
        paymentDate.setMonth(paymentDate.getMonth() + i * 3);
      } else {
        paymentDate.setFullYear(paymentDate.getFullYear() + i);
      }
      payments.push({ date: paymentDate, amount: config.recurringAmount });
    }
  }

  // Add one-time payments (at the end of the specified year)
  config.oneTimePayments.forEach((payment) => {
    if (payment.amount > 0 && payment.year <= termYears) {
      const paymentDate = new Date(startDate);
      paymentDate.setFullYear(paymentDate.getFullYear() + payment.year);

      // For percentage-based, we estimate based on initial principal
      // (actual will be calculated during amortization)
      const amount = payment.isPercentage
        ? (principal * payment.amount) / 100
        : payment.amount;

      payments.push({ date: paymentDate, amount });
    }
  });

  return payments;
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
    paymentInterval: ExtendedPaymentInterval;
  }) => React.ReactNode;
  renderWarnings?: (props: {
    result: LoanSummary;
    principal: number;
    interestRate: number;
    gracePeriodYears: number;
    paymentInterval: ExtendedPaymentInterval;
    termYears: number;
  }) => React.ReactNode;
}) {
  const [principal, setPrincipal] = useState(defaultPrincipal);
  const [interestRate, setInterestRate] = useState(6.5);
  const [termYears, setTermYears] = useState(defaultTermYears);
  const [paymentInterval, setPaymentInterval] =
    useState<ExtendedPaymentInterval>("month");
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
    const periodsPerYear = getPeriodsPerYear(paymentInterval);
    const termPeriods = termYears * periodsPerYear;
    const serviceInterval = toServiceInterval(paymentInterval);
    const startDate = new Date();

    // For weekly/biweekly, we adjust the calculation approach
    // by converting to equivalent monthly periods
    let adjustedTermPeriods = termPeriods;
    let adjustedGracePeriods = gracePeriodYears * periodsPerYear;

    if (paymentInterval === "week" || paymentInterval === "biweekly") {
      // Convert to monthly equivalent for the service
      adjustedTermPeriods = termYears * 12;
      adjustedGracePeriods = gracePeriodYears * 12;
    }

    const baseInput = {
      loanType,
      principal,
      annualInterestRate: interestRate / 100,
      termPeriods: adjustedTermPeriods,
      paymentInterval: serviceInterval,
      startDate,
      ...(showGracePeriod && { gracePeriods: adjustedGracePeriods }),
    };

    // Calculate without extra payments
    const withoutExtra = calculateLoanSchedule(baseInput);
    setResultWithoutExtra(withoutExtra);

    // Calculate with extra payments
    const prepayments = buildPrepayments(
      extraPaymentConfig,
      principal,
      termYears,
      paymentInterval,
      startDate,
    );

    const withExtra = calculateLoanSchedule({
      ...baseInput,
      prepayments: prepayments.length > 0 ? prepayments : undefined,
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
              <Label htmlFor="principal">Loan Amount</Label>
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
              <Label htmlFor="interest-rate">Annual Interest Rate (%)</Label>
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
              <Label htmlFor="term-years">Loan Term (Years)</Label>
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
              <Label htmlFor="payment-interval">Payment Schedule</Label>
              <Select
                value={paymentInterval}
                onValueChange={(v) =>
                  setPaymentInterval(v as ExtendedPaymentInterval)
                }
              >
                <SelectTrigger>
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">Weekly</SelectItem>
                  <SelectItem value="biweekly">Bi-weekly</SelectItem>
                  <SelectItem value="month">Monthly</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="year">Yearly</SelectItem>
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
            principal={principal}
            paymentInterval={paymentInterval}
          />

          <Button onClick={calculate} size="lg" className="w-full md:w-auto">
            Calculate My Loan
          </Button>
        </div>

        {result && (
          <div className="mt-8 space-y-6">
            <h3 className="text-lg font-semibold">Your Results</h3>

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
  return (
    <GenericLoanCalculator
      loanType="ANNUITY"
      title="Fixed Payment Loan Calculator"
      description="Calculate your periodic payment and see how it breaks down over time."
    />
  );
}

function ConstantPrincipalCalculator() {
  return (
    <GenericLoanCalculator
      loanType="CONSTANT_PRINCIPAL"
      title="Declining Payment Loan Calculator"
      description="See how your payments decrease over time as you pay off the principal."
      renderAdditionalResults={({ result }) => {
        const firstPayment = result.schedule[0]?.totalPayment ?? 0;
        const lastPayment =
          result.schedule[result.schedule.length - 1]?.totalPayment ?? 0;

        return (
          <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900 rounded-lg p-4">
            <h4 className="font-semibold text-green-800 dark:text-green-200 mb-2">
              💰 Payment Savings
            </h4>
            <p className="text-sm text-green-700 dark:text-green-300">
              Your payment drops from {formatCurrencyPrecise(firstPayment)} to{" "}
              {formatCurrencyPrecise(lastPayment)} — that&apos;s{" "}
              {formatCurrencyPrecise(firstPayment - lastPayment)} less per
              period by the end!
            </p>
          </div>
        );
      }}
    />
  );
}

function InterestOnlyCalculator() {
  return (
    <GenericLoanCalculator
      loanType="INTEREST_ONLY_THEN"
      title="Interest-Only Loan Calculator"
      description="Pay only interest for a period, then start paying principal."
      showGracePeriod
      renderAdditionalInputs={({
        gracePeriodYears,
        setGracePeriodYears,
        termYears,
      }) => (
        <div className="space-y-2">
          <Label htmlFor="interest-only-years">
            Interest-Only Period (Years)
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
            How many years before you start paying principal?
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
        const periodsPerYear = getPeriodsPerYear(paymentInterval);
        const interestOnlyPayment =
          (principal * (interestRate / 100)) / periodsPerYear;
        const afterGraceIndex = gracePeriodYears * periodsPerYear;
        const afterGracePayment =
          result.schedule[afterGraceIndex]?.scheduledPayment ?? 0;

        if (afterGracePayment <= interestOnlyPayment) return null;

        return (
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-lg p-4">
            <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
              ⚠️ Payment Shock Warning
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300">
              After {gracePeriodYears} years, your payment will jump from{" "}
              {formatCurrencyPrecise(interestOnlyPayment)} to{" "}
              {formatCurrencyPrecise(afterGracePayment)} — an increase of{" "}
              {formatCurrencyPrecise(afterGracePayment - interestOnlyPayment)} (
              {((afterGracePayment / interestOnlyPayment - 1) * 100).toFixed(0)}
              % more). Make sure you can afford this!
            </p>
          </div>
        );
      }}
    />
  );
}

function BulletCalculator() {
  return (
    <GenericLoanCalculator
      loanType="BULLET"
      title="Balloon / Bullet Loan Calculator"
      description="Pay interest only throughout, with the full principal due at the end."
      defaultTermYears={5}
      defaultPrincipal={100000}
      renderWarnings={({ principal, termYears }) => (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4">
          <h4 className="font-semibold text-red-800 dark:text-red-200 mb-2">
            🚨 Balloon Payment Warning
          </h4>
          <p className="text-sm text-red-700 dark:text-red-300 mb-2">
            At the end of {termYears} years, you must pay{" "}
            {formatCurrency(principal)} in one lump sum. This is called a
            &quot;balloon payment.&quot;
          </p>
          <p className="text-sm text-red-700 dark:text-red-300">
            <strong>Your options when the balloon is due:</strong> Refinance
            into a new loan, sell the asset, or pay from savings. If you
            can&apos;t do any of these, you risk losing the asset.
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
  const [principal, setPrincipal] = useState(250000);
  const [interestRate, setInterestRate] = useState(6.5);
  const [termYears, setTermYears] = useState(30);
  const [paymentInterval, setPaymentInterval] =
    useState<ExtendedPaymentInterval>("month");
  const [results, setResults] = useState<{
    annuity: LoanSummary;
    constantPrincipal: LoanSummary;
    interestOnly: LoanSummary;
    bullet: LoanSummary;
  } | null>(null);

  function calculateAll() {
    const periodsPerYear = getPeriodsPerYear(paymentInterval);
    const serviceInterval = toServiceInterval(paymentInterval);

    let termPeriods = termYears * periodsPerYear;
    let gracePeriods = 5 * periodsPerYear;

    if (paymentInterval === "week" || paymentInterval === "biweekly") {
      termPeriods = termYears * 12;
      gracePeriods = 5 * 12;
    }

    const baseInput = {
      principal,
      annualInterestRate: interestRate / 100,
      termPeriods,
      paymentInterval: serviceInterval,
      startDate: new Date(),
    };

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
          type: "Fixed Payment",
          payment: results.annuity.typicalPayment,
          interest: results.annuity.totalInterest,
          total: results.annuity.totalPayment,
        },
        {
          type: "Declining",
          payment: results.constantPrincipal.schedule[0]?.totalPayment ?? 0,
          interest: results.constantPrincipal.totalInterest,
          total: results.constantPrincipal.totalPayment,
        },
        {
          type: "Interest-Only",
          payment: results.interestOnly.schedule[0]?.totalPayment ?? 0,
          interest: results.interestOnly.totalInterest,
          total: results.interestOnly.totalPayment,
        },
        {
          type: "Bullet",
          payment: results.bullet.schedule[0]?.totalPayment ?? 0,
          interest: results.bullet.totalInterest,
          total: results.bullet.totalPayment,
        },
      ]
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Side-by-Side Comparison</CardTitle>
        <CardDescription>
          See how different loan types compare with the same amount, rate, and
          term.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="space-y-2">
            <Label>Loan Amount</Label>
            <Input
              type="number"
              value={principal}
              onChange={(e) => setPrincipal(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Interest Rate (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={interestRate}
              onChange={(e) => setInterestRate(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Term (Years)</Label>
            <Input
              type="number"
              value={termYears}
              onChange={(e) => setTermYears(Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label>Payment Schedule</Label>
            <Select
              value={paymentInterval}
              onValueChange={(v) =>
                setPaymentInterval(v as ExtendedPaymentInterval)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="biweekly">Bi-weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
                <SelectItem value="quarter">Quarterly</SelectItem>
                <SelectItem value="year">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={calculateAll} className="mb-6">
          Compare All Loan Types
        </Button>

        {results && (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-start">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Loan Type</TableHead>
                      <TableHead className="text-right">
                        First Payment
                      </TableHead>
                      <TableHead className="text-right">
                        Total Interest
                      </TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {comparisonData.map((row) => (
                      <TableRow key={row.type}>
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
                  Total Interest Comparison
                </h4>
                <ChartContainer
                  config={paymentChartConfig}
                  className="h-[180px] w-full"
                >
                  <BarChart data={comparisonData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    />
                    <YAxis type="category" dataKey="type" width={100} />
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
              <h4 className="font-semibold mb-4">
                Payment Breakdown & Balance by Loan Type
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <LoanTypeChartsCard
                  title="Fixed Payment"
                  schedule={results.annuity.schedule}
                  paymentInterval={paymentInterval}
                  color="blue"
                />
                <LoanTypeChartsCard
                  title="Declining Payment"
                  schedule={results.constantPrincipal.schedule}
                  paymentInterval={paymentInterval}
                  color="green"
                />
                <LoanTypeChartsCard
                  title="Interest-Only"
                  schedule={results.interestOnly.schedule}
                  paymentInterval={paymentInterval}
                  color="amber"
                />
                <LoanTypeChartsCard
                  title="Bullet"
                  schedule={results.bullet.schedule}
                  paymentInterval={paymentInterval}
                  color="red"
                />
              </div>
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-semibold mb-2">💡 Key Insight</h4>
              <p className="text-sm text-muted-foreground">
                The <strong>Declining Payment Loan</strong> saves you{" "}
                {formatCurrency(
                  results.annuity.totalInterest -
                    results.constantPrincipal.totalInterest,
                )}{" "}
                in interest compared to a Fixed Payment Loan, but your first
                payment is{" "}
                {formatCurrency(
                  (results.constantPrincipal.schedule[0]?.totalPayment ?? 0) -
                    results.annuity.typicalPayment,
                )}{" "}
                higher. Choose based on your current budget and future income
                expectations.
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
