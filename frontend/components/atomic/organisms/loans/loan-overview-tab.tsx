"use client";

import { useMemo } from "react";
import { Doc } from "@/convex/_generated/dataModel";
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
  ResponsiveContainer,
  Legend,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  TrendingDown,
  DollarSign,
  Percent,
  Target,
  Calendar,
} from "lucide-react";

type Loan = Doc<"loans">;
type LoanPayment = Doc<"loanPayments">;

interface LoanOverviewTabProps {
  loan: Loan;
  payments: LoanPayment[];
  progress: number;
  totalPaid: number;
  totalInterestPaid: number;
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
    day: "numeric",
    year: "numeric",
  });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
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

// Chart config
const balanceChartConfig: ChartConfig = {
  balance: {
    label: "Actual Balance",
    color: "hsl(221, 83%, 53%)",
  },
  scheduledBalance: {
    label: "Projected Balance",
    color: "hsl(221, 83%, 53%)",
  },
  principal: {
    label: "Principal Paid",
    color: "hsl(142, 76%, 36%)",
  },
  interest: {
    label: "Interest Paid",
    color: "hsl(24, 95%, 53%)",
  },
};

const paymentChartConfig: ChartConfig = {
  principal: {
    label: "Principal",
    color: "hsl(142, 76%, 36%)",
  },
  interest: {
    label: "Interest",
    color: "hsl(24, 95%, 53%)",
  },
  scheduledPrincipal: {
    label: "Scheduled Principal",
    color: "hsl(142, 76%, 36%)",
  },
  scheduledInterest: {
    label: "Scheduled Interest",
    color: "hsl(24, 95%, 53%)",
  },
};

const COLORS = [
  "hsl(142, 76%, 36%)",
  "hsl(221, 83%, 53%)",
  "hsl(24, 95%, 53%)",
];

export function LoanOverviewTab({
  loan,
  payments,
  progress,
  totalPaid,
  totalInterestPaid,
}: LoanOverviewTabProps) {
  // Calculate balance history from payments AND projected future balance
  const balanceHistory = useMemo(() => {
    const paymentsPerYear =
      loan.paymentFrequency === "MONTHLY"
        ? 12
        : loan.paymentFrequency === "QUARTERLY"
          ? 4
          : loan.paymentFrequency === "SEMI_ANNUAL"
            ? 2
            : 1;
    const periodicRate = loan.annualInterestRate / paymentsPerYear;
    const totalPeriods = Math.ceil(loan.termMonths / (12 / paymentsPerYear));

    // Build combined history with both actual and scheduled data points
    const history: Array<{
      date: string;
      balance: number | null;
      scheduledBalance: number | null;
    }> = [];

    // Start with loan origination - actual balance
    history.push({
      date: loan.startDate,
      balance: loan.originalPrincipal,
      scheduledBalance: null,
    });

    // Calculate actual balance progression based on payments
    let runningBalance = loan.originalPrincipal;
    let lastActualDate = loan.startDate;

    if (payments.length > 0) {
      const sortedPayments = [...payments].sort(
        (a, b) =>
          new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime(),
      );

      sortedPayments.forEach((payment) => {
        runningBalance = Math.max(0, runningBalance - payment.principalPortion);
        lastActualDate = payment.paymentDate;
        history.push({
          date: payment.paymentDate,
          balance: runningBalance,
          scheduledBalance: null,
        });
      });
    }

    // The last actual payment point also serves as the bridge to scheduled
    // Add scheduledBalance to the last actual point so lines connect
    if (history.length > 0) {
      const lastActualPoint = history[history.length - 1];
      lastActualPoint.scheduledBalance = lastActualPoint.balance;
    }

    // Generate projected future balance based on scheduled payments
    // Start from the last actual payment date and generate all future scheduled payments
    let balance = loan.currentBalance;

    // Calculate the first scheduled payment date after the last actual payment
    let currentDate = new Date(loan.startDate);
    currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency); // First payment date

    // Advance to find the first scheduled date after the last actual payment
    while (currentDate.toISOString().split("T")[0] <= lastActualDate) {
      currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency);
    }

    // Calculate scheduled balance decreases for remaining periods
    for (let i = 0; i < totalPeriods && balance > 0.01; i++) {
      const dateStr = currentDate.toISOString().split("T")[0];

      const interest = balance * periodicRate;
      let principal: number;

      if (loan.loanType === "ANNUITY") {
        principal = Math.min(
          Math.max(0, loan.scheduledPayment - interest),
          balance,
        );
      } else if (loan.loanType === "CONSTANT_PRINCIPAL") {
        principal = Math.min(loan.originalPrincipal / totalPeriods, balance);
      } else if (loan.loanType === "BULLET") {
        // Final payment for bullet loans
        if (dateStr >= loan.expectedEndDate) {
          principal = balance;
        } else {
          principal = 0;
        }
      } else {
        principal = Math.min(
          Math.max(0, loan.scheduledPayment - interest),
          balance,
        );
      }

      balance = Math.max(0, balance - principal);

      history.push({
        date: dateStr,
        balance: null, // No actual balance for future dates
        scheduledBalance: balance,
      });

      if (balance <= 0.01) break;
      currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency);
    }

    // Sort by date
    history.sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );

    return history;
  }, [loan, payments]);

  // Calculate payment breakdown for pie chart
  const paymentBreakdown = useMemo(() => {
    const totalPrincipal = loan.originalPrincipal - loan.currentBalance;
    return [
      { name: "Principal Paid", value: totalPrincipal },
      { name: "Remaining", value: loan.currentBalance },
      { name: "Interest Paid", value: totalInterestPaid },
    ];
  }, [loan, totalInterestPaid]);

  // Calculate monthly payment breakdown over time (including scheduled future payments)
  const paymentHistory = useMemo(() => {
    const paymentsPerYear =
      loan.paymentFrequency === "MONTHLY"
        ? 12
        : loan.paymentFrequency === "QUARTERLY"
          ? 4
          : loan.paymentFrequency === "SEMI_ANNUAL"
            ? 2
            : 1;
    const periodicRate = loan.annualInterestRate / paymentsPerYear;

    // Group past payments by month
    const pastGrouped = new Map<
      string,
      { principal: number; interest: number }
    >();

    payments.forEach((payment) => {
      const monthKey = payment.paymentDate.substring(0, 7); // YYYY-MM
      const existing = pastGrouped.get(monthKey) || {
        principal: 0,
        interest: 0,
      };
      pastGrouped.set(monthKey, {
        principal: existing.principal + payment.principalPortion,
        interest: existing.interest + payment.interestPortion,
      });
    });

    // Generate scheduled future payments (next 12 periods)
    const scheduledPayments: Array<{
      month: string;
      principal: number;
      interest: number;
    }> = [];
    let balance = loan.currentBalance;
    let currentDate = new Date(loan.nextPaymentDate);

    for (let i = 0; i < 12 && balance > 0.01; i++) {
      const monthKey = currentDate.toISOString().substring(0, 7);
      const interest = balance * periodicRate;
      let principal: number;

      if (loan.loanType === "ANNUITY") {
        principal = Math.min(loan.scheduledPayment - interest, balance);
      } else if (loan.loanType === "CONSTANT_PRINCIPAL") {
        const totalPeriods = loan.termMonths / (12 / paymentsPerYear);
        principal = Math.min(loan.originalPrincipal / totalPeriods, balance);
      } else if (loan.loanType === "BULLET") {
        principal = 0;
      } else {
        principal = Math.min(loan.scheduledPayment - interest, balance);
      }

      scheduledPayments.push({
        month: monthKey,
        principal: Math.max(0, principal),
        interest: Math.max(0, interest),
      });

      balance = Math.max(0, balance - principal);
      currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency);
    }

    // Combine past and scheduled payments
    const allMonths = new Set([
      ...Array.from(pastGrouped.keys()),
      ...scheduledPayments.map((s) => s.month),
    ]);

    const sortedMonths = Array.from(allMonths).sort();
    const today = new Date().toISOString().substring(0, 7);

    // Take last 6 past + next 6 scheduled (roughly)
    const relevantMonths = sortedMonths.filter((m) => {
      const pastMonths = Array.from(pastGrouped.keys()).filter(
        (pm) => pm <= today,
      );
      const lastPast = pastMonths.sort().slice(-6);
      const futureMonths = scheduledPayments
        .map((s) => s.month)
        .filter((fm) => fm > today)
        .slice(0, 6);
      return lastPast.includes(m) || futureMonths.includes(m);
    });

    return relevantMonths.map((month) => {
      const past = pastGrouped.get(month);
      const scheduled = scheduledPayments.find((s) => s.month === month);
      const isPast = month <= today;

      return {
        month: new Date(month + "-01").toLocaleDateString("en-US", {
          month: "short",
          year: "2-digit",
        }),
        // Past payments (solid colors)
        principal: isPast ? past?.principal || 0 : 0,
        interest: isPast ? past?.interest || 0 : 0,
        // Scheduled payments (will be rendered with opacity)
        scheduledPrincipal: !isPast ? scheduled?.principal || 0 : 0,
        scheduledInterest: !isPast ? scheduled?.interest || 0 : 0,
        isScheduled: !isPast,
      };
    });
  }, [payments, loan]);

  // Calculate estimated total interest
  const estimatedTotalInterest = useMemo(() => {
    // Simple estimation based on current rate
    const paymentsPerYear =
      loan.paymentFrequency === "MONTHLY"
        ? 12
        : loan.paymentFrequency === "QUARTERLY"
          ? 4
          : loan.paymentFrequency === "SEMI_ANNUAL"
            ? 2
            : 1;
    const totalPayments = loan.termMonths / (12 / paymentsPerYear);
    return Math.max(
      0,
      loan.scheduledPayment * totalPayments - loan.originalPrincipal,
    );
  }, [loan]);

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Circle */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Payoff Progress</CardTitle>
            <CardDescription>
              {formatCurrency(totalPaid, loan.currency)} paid of{" "}
              {formatCurrency(loan.originalPrincipal, loan.currency)}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90">
                {/* Background circle */}
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className="text-muted"
                />
                {/* Progress circle */}
                <circle
                  cx="96"
                  cy="96"
                  r="88"
                  stroke="currentColor"
                  strokeWidth="12"
                  fill="none"
                  className="text-green-500"
                  strokeLinecap="round"
                  strokeDasharray={`${(progress / 100) * 553} 553`}
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-4xl font-bold">
                  {progress.toFixed(1)}%
                </span>
                <span className="text-sm text-muted-foreground">Complete</span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(loan.currentBalance, loan.currency)}
              </p>
              <p className="text-sm text-muted-foreground">Remaining balance</p>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">Loan Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Original Amount</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(loan.originalPrincipal, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Interest Rate</p>
                <p className="text-xl font-semibold">
                  {formatPercent(loan.annualInterestRate)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Principal Paid</p>
                <p className="text-xl font-semibold text-green-600">
                  {formatCurrency(totalPaid, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">Interest Paid</p>
                <p className="text-xl font-semibold text-orange-600">
                  {formatCurrency(totalInterestPaid, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Est. Total Interest
                </p>
                <p className="text-xl font-semibold">
                  {formatCurrency(estimatedTotalInterest, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  Total Payments Made
                </p>
                <p className="text-xl font-semibold">{payments.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Breakdown Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Payment Breakdown</CardTitle>
            <CardDescription>
              Principal vs interest (scheduled payments shown lighter)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {paymentHistory.length > 0 ? (
              <ChartContainer
                config={paymentChartConfig}
                className="h-[300px] w-full"
              >
                <BarChart data={paymentHistory}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} />
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
                          const label =
                            name === "principal"
                              ? "Principal"
                              : name === "interest"
                                ? "Interest"
                                : name === "scheduledPrincipal"
                                  ? "Scheduled Principal"
                                  : "Scheduled Interest";
                          return [
                            formatCurrency(value as number, loan.currency),
                            label,
                          ];
                        }}
                      />
                    }
                  />
                  {/* Past payments - solid */}
                  <Bar
                    dataKey="principal"
                    stackId="a"
                    fill="hsl(142, 76%, 36%)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="interest"
                    stackId="a"
                    fill="hsl(24, 95%, 53%)"
                    radius={[0, 0, 0, 0]}
                  />
                  {/* Scheduled payments - with opacity */}
                  <Bar
                    dataKey="scheduledPrincipal"
                    stackId="a"
                    fill="hsl(142, 76%, 36%)"
                    fillOpacity={0.3}
                    stroke="hsl(142, 76%, 36%)"
                    strokeDasharray="3 3"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="scheduledInterest"
                    stackId="a"
                    fill="hsl(24, 95%, 53%)"
                    fillOpacity={0.3}
                    stroke="hsl(24, 95%, 53%)"
                    strokeDasharray="3 3"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                No payment data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Balance Over Time Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Balance Over Time</CardTitle>
            <CardDescription>
              Actual balance and projected payoff schedule
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={balanceChartConfig}
              className="h-[300px] w-full"
            >
              <AreaChart data={balanceHistory}>
                <defs>
                  <linearGradient
                    id="balanceGradient"
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
                    id="scheduledGradient"
                    x1="0"
                    y1="0"
                    x2="0"
                    y2="1"
                  >
                    <stop
                      offset="5%"
                      stopColor="hsl(221, 83%, 53%)"
                      stopOpacity={0.1}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(221, 83%, 53%)"
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(value) =>
                    new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      year: "2-digit",
                    })
                  }
                  tickLine={false}
                  axisLine={false}
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
                        if (value === null) return null;
                        const label =
                          name === "balance"
                            ? "Actual Balance"
                            : "Projected Balance";
                        return [
                          formatCurrency(value as number, loan.currency),
                          label,
                        ];
                      }}
                    />
                  }
                />
                {/* Scheduled/Projected balance - grayed out, dashed */}
                <Area
                  type="monotone"
                  dataKey="scheduledBalance"
                  stroke="hsl(221, 83%, 53%)"
                  strokeOpacity={0.4}
                  strokeDasharray="5 5"
                  fill="url(#scheduledGradient)"
                  strokeWidth={2}
                  connectNulls
                />
                {/* Actual balance - solid */}
                <Area
                  type="monotone"
                  dataKey="balance"
                  stroke="hsl(221, 83%, 53%)"
                  fill="url(#balanceGradient)"
                  strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      {/* Important Dates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Important Dates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Loan Start Date</p>
                <p className="font-semibold">{formatDate(loan.startDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Next Payment</p>
                <p className="font-semibold">
                  {formatDate(loan.nextPaymentDate)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Target className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">Expected Payoff</p>
                <p className="font-semibold">
                  {formatDate(loan.expectedEndDate)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
