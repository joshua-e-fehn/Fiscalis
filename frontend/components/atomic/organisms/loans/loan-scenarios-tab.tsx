"use client";

import { useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { Doc } from "@/convex/_generated/dataModel";
import { useSaveScenario, useDeleteScenario } from "@/hooks/convex/loans";
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
import { Slider } from "@/components/ui/shadcn/slider";
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
type LoanScenario = Doc<"loanScenarios">;

interface LoanScenariosTabProps {
  loan: Loan;
  scenarios: LoanScenario[];
}

interface OneTimePrepayment {
  id: string;
  date: string;
  amount: number;
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
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function getPaymentFrequencyLabel(frequency: string): string {
  switch (frequency) {
    case "MONTHLY":
      return "Monthly";
    case "QUARTERLY":
      return "Quarterly";
    case "SEMI_ANNUAL":
      return "Semi-Annual";
    case "ANNUAL":
      return "Annual";
    default:
      return "Periodic";
  }
}

function addPaymentPeriod(date: Date, frequency: string): Date {
  const newDate = new Date(date);
  switch (frequency) {
    case "MONTHLY":
      newDate.setMonth(newDate.getMonth() + 1);
      break;
    case "QUARTERLY":
      newDate.setMonth(newDate.getMonth() + 3);
      break;
    case "SEMI_ANNUAL":
      newDate.setMonth(newDate.getMonth() + 6);
      break;
    case "ANNUAL":
      newDate.setFullYear(newDate.getFullYear() + 1);
      break;
  }
  return newDate;
}

// Chart configs
const balanceChartConfig: ChartConfig = {
  originalBalance: {
    label: "Current Plan",
    color: "hsl(221, 83%, 53%)",
  },
  scenarioBalance: {
    label: "With Prepayments",
    color: "hsl(142, 76%, 36%)",
  },
};

const paymentChartConfig: ChartConfig = {
  originalPrincipal: {
    label: "Original Principal",
    color: "hsl(221, 83%, 53%)",
  },
  originalInterest: {
    label: "Original Interest",
    color: "hsl(221, 60%, 70%)",
  },
  scenarioPrincipal: {
    label: "Scenario Principal",
    color: "hsl(142, 76%, 36%)",
  },
  scenarioInterest: {
    label: "Scenario Interest",
    color: "hsl(142, 50%, 60%)",
  },
};

function calculateScenario(
  loan: Loan,
  extraPeriodicPayment: number,
  oneTimePrepayments: OneTimePrepayment[] = [],
): ScenarioResult {
  const paymentsPerYear =
    loan.paymentFrequency === "MONTHLY"
      ? 12
      : loan.paymentFrequency === "QUARTERLY"
        ? 4
        : loan.paymentFrequency === "SEMI_ANNUAL"
          ? 2
          : 1;
  const periodicRate = loan.annualInterestRate / paymentsPerYear;

  // Sort prepayments by date
  const sortedPrepayments = [...oneTimePrepayments].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Data for charts
  const balanceHistory: ScenarioResult["balanceHistory"] = [];
  const paymentBreakdown: ScenarioResult["paymentBreakdown"] = [];

  // Calculate original scenario (no changes)
  let originalBalance = loan.currentBalance;
  let originalPeriods = 0;
  let originalTotalInterest = 0;
  const originalBalanceData: Array<{ date: Date; balance: number }> = [];

  let currentDate = new Date();
  originalBalanceData.push({
    date: new Date(currentDate),
    balance: originalBalance,
  });

  while (originalBalance > 0.01 && originalPeriods < 600) {
    const interest = originalBalance * periodicRate;
    const principal = Math.min(
      loan.scheduledPayment - interest,
      originalBalance,
    );
    originalBalance = Math.max(0, originalBalance - principal);
    originalTotalInterest += interest;
    originalPeriods++;
    currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency);
    originalBalanceData.push({
      date: new Date(currentDate),
      balance: originalBalance,
    });
  }

  // Calculate new scenario with extra payment
  let scenarioBalance = loan.currentBalance;
  let scenarioPeriods = 0;
  let scenarioTotalInterest = 0;
  const newPayment = loan.scheduledPayment + extraPeriodicPayment;
  const scenarioBalanceData: Array<{ date: Date; balance: number }> = [];
  let prepaymentIndex = 0;
  let totalPrepaymentAmount = 0;

  currentDate = new Date();
  scenarioBalanceData.push({
    date: new Date(currentDate),
    balance: scenarioBalance,
  });

  while (scenarioBalance > 0.01 && scenarioPeriods < 600) {
    const periodDate = currentDate;

    // Check for prepayments that should be applied before this period
    while (
      prepaymentIndex < sortedPrepayments.length &&
      new Date(sortedPrepayments[prepaymentIndex].date) <= periodDate
    ) {
      const prepayment = sortedPrepayments[prepaymentIndex];
      scenarioBalance = Math.max(0, scenarioBalance - prepayment.amount);
      totalPrepaymentAmount += prepayment.amount;
      prepaymentIndex++;
    }

    if (scenarioBalance <= 0.01) break;

    const interest = scenarioBalance * periodicRate;
    const principal = Math.min(newPayment - interest, scenarioBalance);
    scenarioBalance = Math.max(0, scenarioBalance - principal);
    scenarioTotalInterest += interest;
    scenarioPeriods++;
    currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency);
    scenarioBalanceData.push({
      date: new Date(currentDate),
      balance: scenarioBalance,
    });
  }

  // Build balance history for chart (yearly data points)
  const allDates = new Set<number>();
  originalBalanceData.forEach((d) => allDates.add(d.date.getFullYear()));
  scenarioBalanceData.forEach((d) => allDates.add(d.date.getFullYear()));

  const sortedYears = Array.from(allDates).sort();

  sortedYears.forEach((year) => {
    // Get the last balance for this year
    const originalYearData = originalBalanceData.filter(
      (d) => d.date.getFullYear() === year,
    );
    const scenarioYearData = scenarioBalanceData.filter(
      (d) => d.date.getFullYear() === year,
    );

    const origBal =
      originalYearData.length > 0
        ? originalYearData[originalYearData.length - 1].balance
        : null;
    const scenBal =
      scenarioYearData.length > 0
        ? scenarioYearData[scenarioYearData.length - 1].balance
        : null;

    balanceHistory.push({
      date: `${year}`,
      originalBalance: origBal,
      scenarioBalance: scenBal,
    });
  });

  // Build payment breakdown (first 12 periods or all if fewer)
  const periodsToShow = Math.min(
    12,
    Math.max(originalPeriods, scenarioPeriods),
  );
  let origBal = loan.currentBalance;
  let scenBal = loan.currentBalance;
  prepaymentIndex = 0;
  currentDate = new Date();

  for (let i = 0; i < periodsToShow; i++) {
    const periodDate = currentDate;

    // Check for prepayments in this period for scenario
    let periodPrepayment = 0;
    while (
      prepaymentIndex < sortedPrepayments.length &&
      new Date(sortedPrepayments[prepaymentIndex].date) <= periodDate
    ) {
      periodPrepayment += sortedPrepayments[prepaymentIndex].amount;
      scenBal = Math.max(
        0,
        scenBal - sortedPrepayments[prepaymentIndex].amount,
      );
      prepaymentIndex++;
    }

    // Original calculation (standard payment only)
    const origInterest = origBal > 0.01 ? origBal * periodicRate : 0;
    const origPrincipal =
      origBal > 0.01
        ? Math.min(loan.scheduledPayment - origInterest, origBal)
        : 0;
    origBal = Math.max(0, origBal - origPrincipal);

    // Scenario calculation - separate the base payment from extra
    const scenInterest = scenBal > 0.01 ? scenBal * periodicRate : 0;
    // Base principal (from scheduled payment)
    const basePrincipal =
      scenBal > 0.01
        ? Math.min(loan.scheduledPayment - scenInterest, scenBal)
        : 0;
    // Extra payment goes entirely to principal
    const extraPrincipalFromPayment =
      scenBal > 0.01
        ? Math.min(extraPeriodicPayment, scenBal - basePrincipal)
        : 0;
    const scenPrincipal = basePrincipal + extraPrincipalFromPayment;
    scenBal = Math.max(0, scenBal - scenPrincipal);

    // Total extra for this period (recurring + any lump sum)
    const totalExtraThisPeriod = extraPrincipalFromPayment + periodPrepayment;

    paymentBreakdown.push({
      period: formatDate(periodDate.toISOString()),
      originalPrincipal: origPrincipal,
      originalInterest: origInterest,
      scenarioPrincipal: basePrincipal,
      scenarioInterest: scenInterest,
      extraPayment: totalExtraThisPeriod,
    });

    currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency);
  }

  // Calculate results
  const periodsSaved = originalPeriods - scenarioPeriods;
  const interestSaved = originalTotalInterest - scenarioTotalInterest;

  const today = new Date();
  const originalEndDate = new Date(today);
  for (let i = 0; i < originalPeriods; i++) {
    addPaymentPeriod(originalEndDate, loan.paymentFrequency);
  }

  const newEndDate = new Date(today);
  for (let i = 0; i < scenarioPeriods; i++) {
    addPaymentPeriod(newEndDate, loan.paymentFrequency);
  }

  // Convert periods to months for display
  const periodsPerYear = paymentsPerYear;
  const monthsSaved = Math.round((periodsSaved / periodsPerYear) * 12);

  return {
    originalMonths: Math.round((originalPeriods / periodsPerYear) * 12),
    newMonths: Math.round((scenarioPeriods / periodsPerYear) * 12),
    monthsSaved,
    originalTotalInterest,
    newTotalInterest: scenarioTotalInterest,
    interestSaved,
    originalEndDate: originalEndDate.toISOString().split("T")[0],
    newEndDate: newEndDate.toISOString().split("T")[0],
    totalExtraPayments:
      extraPeriodicPayment * scenarioPeriods + totalPrepaymentAmount,
    balanceHistory,
    paymentBreakdown,
  };
}

export function LoanScenariosTab({ loan, scenarios }: LoanScenariosTabProps) {
  const { user } = useUser();
  const { saveScenario } = useSaveScenario();
  const { deleteScenario } = useDeleteScenario();

  const [extraPayment, setExtraPayment] = useState(0);
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
  const frequencyLabel = getPaymentFrequencyLabel(loan.paymentFrequency);

  // Calculate live scenario
  const liveScenario = useMemo(
    () => calculateScenario(loan, extraPayment, oneTimePrepayments),
    [loan, extraPayment, oneTimePrepayments],
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

  const handleSaveScenario = async () => {
    if (!user?.id || !scenarioName) return;

    setIsSubmitting(true);
    try {
      await saveScenario({
        userId: user.id,
        loanId: loan._id,
        name: scenarioName,
        extraMonthlyPayment: extraPayment,
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

  const handleDeleteScenario = async (scenarioId: string) => {
    setDeletingId(scenarioId);
    try {
      await deleteScenario(scenarioId as any);
    } catch (error) {
      console.error("Failed to delete scenario:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleLoadScenario = (scenario: LoanScenario) => {
    if (scenario.extraMonthlyPayment) {
      setExtraPayment(scenario.extraMonthlyPayment);
    }
  };

  const maxExtraPayment = Math.min(loan.scheduledPayment * 3, 5000);
  const hasChanges = extraPayment > 0 || oneTimePrepayments.length > 0;

  return (
    <div className="space-y-6">
      {/* Interactive Simulator */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-yellow-500" />
            <CardTitle className="text-lg">What-If Simulator</CardTitle>
          </div>
          <CardDescription>
            See how prepayments can help you save money and pay off your loan
            faster
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Additional Principal Slider */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <Label>Additional Principal ({frequencyLabel})</Label>
              <span className="text-2xl font-bold text-green-600">
                {formatCurrency(extraPayment, loan.currency)}
              </span>
            </div>
            <Slider
              value={[extraPayment]}
              onValueChange={(v: number[]) => setExtraPayment(v[0])}
              max={maxExtraPayment}
              step={25}
              className="mb-2"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{formatCurrency(0, loan.currency)}</span>
              <span>{formatCurrency(maxExtraPayment, loan.currency)}</span>
            </div>
          </div>

          {/* One-Time Prepayments */}
          <div className="border-t pt-4">
            <Label className="mb-3 block">One-Time Prepayments</Label>
            <div className="flex gap-2 mb-3">
              <Input
                type="date"
                value={newPrepaymentDate}
                onChange={(e) => setNewPrepaymentDate(e.target.value)}
                className="w-40"
              />
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {loan.currency === "EUR"
                    ? "€"
                    : loan.currency === "GBP"
                      ? "£"
                      : "$"}
                </span>
                <Input
                  type="number"
                  placeholder="Amount"
                  value={newPrepaymentAmount}
                  onChange={(e) => setNewPrepaymentAmount(e.target.value)}
                  className="pl-7"
                />
              </div>
              <Button
                onClick={handleAddPrepayment}
                size="icon"
                variant="outline"
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
                Current Plan
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Payoff Date
                  </span>
                  <span className="font-medium">
                    {formatDate(liveScenario.originalEndDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Total Interest
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
                    Time Left
                  </span>
                  <span className="font-medium">
                    {Math.floor(liveScenario.originalMonths / 12)}y{" "}
                    {liveScenario.originalMonths % 12}m
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-center">
              <ArrowRight className="h-8 w-8 text-muted-foreground" />
            </div>

            <div className="space-y-4 p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800">
              <h4 className="font-semibold text-sm text-green-700 dark:text-green-400 uppercase">
                With Prepayments
              </h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700 dark:text-green-400">
                    Payoff Date
                  </span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {formatDate(liveScenario.newEndDate)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-green-700 dark:text-green-400">
                    Total Interest
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
                    Time Left
                  </span>
                  <span className="font-medium text-green-700 dark:text-green-400">
                    {Math.floor(liveScenario.newMonths / 12)}y{" "}
                    {liveScenario.newMonths % 12}m
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Savings Summary */}
          {hasChanges && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 p-4 rounded-lg bg-muted">
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">Time Saved</p>
                <p className="text-2xl font-bold text-blue-600">
                  {Math.floor(liveScenario.monthsSaved / 12)}y{" "}
                  {liveScenario.monthsSaved % 12}m
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  Interest Saved
                </p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(liveScenario.interestSaved, loan.currency)}
                </p>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground mb-1">
                  Total Prepaid
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

          {/* Save Button */}
          {hasChanges && (
            <div className="flex justify-end">
              <Button onClick={() => setShowSaveDialog(true)}>
                <Save className="h-4 w-4 mr-2" />
                Save This Scenario
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
              <CardTitle className="text-lg">Balance Over Time</CardTitle>
              <CardDescription>
                Compare how your balance decreases with extra payments
              </CardDescription>
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
                              ? "Current Plan"
                              : "With Prepayments";
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
                  <span>Current Plan</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded bg-[hsl(142,76%,36%)]" />
                  <span>With Prepayments</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Payment Breakdown Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Payment Breakdown</CardTitle>
              <CardDescription>
                Principal vs interest comparison (next{" "}
                {liveScenario.paymentBreakdown.length} payments)
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
                        formatter={(value, name) => {
                          const labels: Record<string, string> = {
                            originalPrincipal: "Current Plan - Principal",
                            originalInterest: "Current Plan - Interest",
                            scenarioPrincipal: "With Extra - Principal",
                            scenarioInterest: "With Extra - Interest",
                            extraPayment: "Extra Payment",
                          };
                          return [
                            formatCurrency(value as number, loan.currency),
                            labels[name as string] || name,
                          ];
                        }}
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
                    Current:
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(221,83%,53%)]" />
                    <span>Principal</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(221,60%,75%)]" />
                    <span>Interest</span>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-muted-foreground font-medium">
                    Scenario:
                  </span>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(142,76%,36%)]" />
                    <span>Principal</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(142,50%,60%)]" />
                    <span>Interest</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-3 h-3 rounded bg-[hsl(45,93%,47%)]" />
                    <span>Extra</span>
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
          <CardTitle className="text-lg">Saved Scenarios</CardTitle>
          <CardDescription>
            Compare different payment strategies you&apos;ve explored
          </CardDescription>
        </CardHeader>
        <CardContent>
          {scenarios.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Target className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No scenarios saved yet</p>
              <p className="text-sm">
                Use the simulator above to create and save scenarios
              </p>
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
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
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
                        <AlertDialogTitle>Delete Scenario</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to delete &quot;{scenario.name}
                          &quot;?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDeleteScenario(scenario._id)}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  <CardContent className="pt-6">
                    <h4 className="font-semibold mb-4">{scenario.name}</h4>
                    <div className="space-y-2 text-sm">
                      {scenario.extraMonthlyPayment !== undefined &&
                        scenario.extraMonthlyPayment > 0 && (
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-muted-foreground" />
                            <span>
                              +
                              {formatCurrency(
                                scenario.extraMonthlyPayment,
                                loan.currency,
                              )}
                              /{frequencyLabel.toLowerCase()}
                            </span>
                          </div>
                        )}
                      {scenario.monthsSaved !== undefined &&
                        scenario.monthsSaved > 0 && (
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-blue-500" />
                            <span>
                              {Math.floor(scenario.monthsSaved / 12)}y{" "}
                              {scenario.monthsSaved % 12}m saved
                            </span>
                          </div>
                        )}
                      {scenario.totalInterestSaved !== undefined &&
                        scenario.totalInterestSaved > 0 && (
                          <div className="flex items-center gap-2">
                            <TrendingDown className="h-4 w-4 text-green-500" />
                            <span className="text-green-600 font-medium">
                              {formatCurrency(
                                scenario.totalInterestSaved,
                                loan.currency,
                              )}{" "}
                              saved
                            </span>
                          </div>
                        )}
                      {scenario.projectedEndDate && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span>
                            Payoff: {formatDate(scenario.projectedEndDate)}
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
                      Load Scenario
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
            <DialogTitle>Save Scenario</DialogTitle>
            <DialogDescription>
              Give your scenario a name to save it for later comparison
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="scenario-name">Scenario Name</Label>
              <Input
                id="scenario-name"
                placeholder={`e.g., +${formatCurrency(extraPayment, loan.currency)} ${frequencyLabel.toLowerCase()}`}
                value={scenarioName}
                onChange={(e) => setScenarioName(e.target.value)}
              />
            </div>

            <div className="p-4 rounded-lg bg-muted">
              <h4 className="font-medium mb-2">Scenario Summary</h4>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">
                  Additional Principal ({frequencyLabel}):
                </span>
                <span>{formatCurrency(extraPayment, loan.currency)}</span>
                {oneTimePrepayments.length > 0 && (
                  <>
                    <span className="text-muted-foreground">Prepayments:</span>
                    <span>{oneTimePrepayments.length} payment(s)</span>
                  </>
                )}
                <span className="text-muted-foreground">Time Saved:</span>
                <span>
                  {Math.floor(liveScenario.monthsSaved / 12)}y{" "}
                  {liveScenario.monthsSaved % 12}m
                </span>
                <span className="text-muted-foreground">Interest Saved:</span>
                <span className="text-green-600 font-medium">
                  {formatCurrency(liveScenario.interestSaved, loan.currency)}
                </span>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveScenario}
              disabled={!scenarioName || isSubmitting}
            >
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Scenario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
