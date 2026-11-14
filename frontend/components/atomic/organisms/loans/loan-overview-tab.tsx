"use client";

import { useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Doc } from "@/convex/_generated/dataModel";
import {
  buildLoanSchedule,
  type LoanKpis,
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
import { Target, Calendar } from "lucide-react";

type Loan = Doc<"loans">;
type LoanPayment = Doc<"loanPayments">;

interface LoanOverviewTabProps {
  loan: Loan;
  payments: LoanPayment[];
  /** The page's KPIs (loanKpis), so every view shows the same numbers. */
  kpis: LoanKpis;
}

// Helper functions
function formatCurrency(value: number, currency: string = "USD"): string {
  return formatMoney(value, currency, { fractionDigits: 0 });
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

type Series = "balance" | "scheduledBalance" | "principal" | "interest" | "scheduledPrincipal" | "scheduledInterest";

export function LoanOverviewTab({
  loan,
  payments,
  kpis,
}: LoanOverviewTabProps) {
  const t = useTranslations("loans.overview");
  const format = useFormatter();
  // Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight
  const formatDate = (date: string) =>
    format.dateTime(new Date(date), "dateOnly");
  const formatAxisMonth = (date: string) =>
    format.dateTime(new Date(date), "axisMonth", { timeZone: "UTC" });
  const seriesLabel = (name: unknown) => t(`series.${name as Series}`);

  const balanceChartConfig: ChartConfig = {
    balance: { label: t("series.balance"), color: "hsl(221, 83%, 53%)" },
    scheduledBalance: {
      label: t("series.scheduledBalance"),
      color: "hsl(221, 83%, 53%)",
    },
  };
  const paymentChartConfig: ChartConfig = {
    principal: { label: t("series.principal"), color: "hsl(142, 76%, 36%)" },
    interest: { label: t("series.interest"), color: "hsl(24, 95%, 53%)" },
    scheduledPrincipal: {
      label: t("series.scheduledPrincipal"),
      color: "hsl(142, 76%, 36%)",
    },
    scheduledInterest: {
      label: t("series.scheduledInterest"),
      color: "hsl(24, 95%, 53%)",
    },
  };

  const { progress, principalRepaid, interestPaid } = kpis;
  // Same schedule as the Payments & Schedule tab, so both views agree
  const schedule = useMemo(
    () => buildLoanSchedule(loan, payments, todayLocalISO()),
    [loan, payments],
  );
  const nextPaymentDate = kpis.nextPayment?.dueDate ?? null;

  // Calculate balance history from payments AND projected future balance
  const balanceHistory = useMemo(() => {
    const recordedRows = schedule.filter((r) => r.status !== "scheduled");
    const projectedRows = schedule.filter((r) => r.status === "scheduled");

    // Build combined history with both actual and scheduled data points
    const history: Array<{
      date: string;
      balance: number | null;
      scheduledBalance: number | null;
    }> = [];

    // Start with loan origination - actual balance
    history.push({
      date: loan.startDate,
      balance: recordedRows[0]?.openingBalance ?? loan.currentBalance,
      scheduledBalance: null,
    });

    recordedRows.forEach((row) => {
      history.push({
        date: row.date,
        balance: row.closingBalance,
        scheduledBalance: null,
      });
    });

    // The last actual payment point also serves as the bridge to scheduled
    // Add scheduledBalance to the last actual point so lines connect
    const lastActualPoint = history[history.length - 1];
    lastActualPoint.scheduledBalance = lastActualPoint.balance;

    projectedRows.forEach((row) => {
      history.push({
        date: row.date,
        balance: null, // No actual balance for future dates
        scheduledBalance: row.closingBalance,
      });
    });

    // Sort by date
    history.sort((a, b) => a.date.localeCompare(b.date));

    return history;
  }, [loan, schedule]);

  // Calculate monthly payment breakdown over time (including scheduled future payments)
  const paymentHistory = useMemo(() => {
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

    // Scheduled future payments (next 12 periods)
    const scheduledPayments = schedule
      .filter((r) => r.status === "scheduled")
      .slice(0, 12)
      .map((r) => ({
        month: r.date.substring(0, 7),
        principal: Math.max(0, r.principal),
        interest: r.interest,
      }));

    // Combine past and scheduled payments
    const allMonths = new Set([
      ...Array.from(pastGrouped.keys()),
      ...scheduledPayments.map((s) => s.month),
    ]);

    const sortedMonths = Array.from(allMonths).sort();
    const today = todayLocalISO().substring(0, 7);

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
        month: format.dateTime(new Date(month + "-01"), "axisMonth", {
          timeZone: "UTC",
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
  }, [payments, schedule, format]);

  // Estimated total interest: interest paid so far plus projected interest
  const estimatedTotalInterest = kpis.totalInterest;

  return (
    <div className="space-y-6">
      {/* Progress Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Progress Circle */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">{t("payoffProgress")}</CardTitle>
            <CardDescription>
              {t("repaidOf", {
                repaid: formatCurrency(principalRepaid, loan.currency),
                original: formatCurrency(loan.originalPrincipal, loan.currency),
              })}
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
                <span className="text-sm text-muted-foreground">
                  {t("complete")}
                </span>
              </div>
            </div>
            <div className="mt-4 text-center">
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(loan.currentBalance, loan.currency)}
              </p>
              <p className="text-sm text-muted-foreground">
                {t("remainingBalance")}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Key Metrics */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">{t("summary")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("originalAmount")}</p>
                <p className="text-xl font-semibold">
                  {formatCurrency(loan.originalPrincipal, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("interestRate")}</p>
                <p className="text-xl font-semibold">
                  {formatPercent(loan.annualInterestRate)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("principalPaid")}</p>
                <p className="text-xl font-semibold text-green-600">
                  {formatCurrency(principalRepaid, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">{t("interestPaid")}</p>
                <p className="text-xl font-semibold text-orange-600">
                  {formatCurrency(interestPaid, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  {t("estimatedTotalInterest")}
                </p>
                <p className="text-xl font-semibold">
                  {formatCurrency(estimatedTotalInterest, loan.currency)}
                </p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <p className="text-sm text-muted-foreground">
                  {t("paymentsMade")}
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
            <CardTitle className="text-lg">{t("breakdownTitle")}</CardTitle>
            <CardDescription>{t("breakdownDescription")}</CardDescription>
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
                        formatter={(value, name) => [
                          formatCurrency(value as number, loan.currency),
                          seriesLabel(name),
                        ]}
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
                {t("noPaymentData")}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Balance Over Time Chart */}
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
                  tickFormatter={(value) => formatAxisMonth(value)}
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
                        return [
                          formatCurrency(value as number, loan.currency),
                          seriesLabel(name),
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
          <CardTitle className="text-lg">{t("importantDates")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("startDate")}</p>
                <p className="font-semibold">{formatDate(loan.startDate)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Calendar className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">{t("nextPayment")}</p>
                <p className="font-semibold">
                  {nextPaymentDate ? formatDate(nextPaymentDate) : "—"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <Target className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm text-muted-foreground">
                  {t("expectedPayoff")}
                </p>
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
