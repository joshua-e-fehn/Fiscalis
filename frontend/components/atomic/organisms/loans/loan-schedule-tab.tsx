"use client";

import { useMemo, useState } from "react";
import { Doc } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
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
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import { ChevronDown, Download, Calendar } from "lucide-react";

type Loan = Doc<"loans">;

interface LoanScheduleTabProps {
  loan: Loan;
}

interface AmortizationRow {
  period: number;
  date: string;
  openingBalance: number;
  payment: number;
  principal: number;
  interest: number;
  closingBalance: number;
  cumulativeInterest: number;
  cumulativePrincipal: number;
}

// Helper functions
function formatCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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

function calculateAmortizationSchedule(loan: Loan): AmortizationRow[] {
  const schedule: AmortizationRow[] = [];
  const paymentsPerYear =
    loan.paymentFrequency === "MONTHLY"
      ? 12
      : loan.paymentFrequency === "QUARTERLY"
        ? 4
        : loan.paymentFrequency === "SEMI_ANNUAL"
          ? 2
          : 1;
  const periodicRate = loan.annualInterestRate / paymentsPerYear;

  let balance = loan.currentBalance;
  let currentDate = new Date(loan.nextPaymentDate);
  let cumulativeInterest = 0;
  let cumulativePrincipal = 0;
  let period = 1;

  while (balance > 0.01 && period <= 600) {
    // Max 600 periods (50 years monthly)
    const openingBalance = balance;
    const interest = openingBalance * periodicRate;
    let principal: number;
    let payment: number;

    if (loan.loanType === "ANNUITY") {
      payment = Math.min(loan.scheduledPayment, openingBalance + interest);
      principal = payment - interest;
    } else if (loan.loanType === "CONSTANT_PRINCIPAL") {
      const remainingPeriods = Math.ceil(
        balance /
          (loan.originalPrincipal / (loan.termMonths / (12 / paymentsPerYear))),
      );
      principal = Math.min(
        loan.originalPrincipal / (loan.termMonths / (12 / paymentsPerYear)),
        balance,
      );
      payment = principal + interest;
    } else if (loan.loanType === "BULLET") {
      // Interest only until the last period
      const remainingPeriods = Math.ceil(
        (new Date(loan.expectedEndDate).getTime() - currentDate.getTime()) /
          (30 * 24 * 60 * 60 * 1000),
      );
      if (remainingPeriods <= 1) {
        principal = balance;
        payment = principal + interest;
      } else {
        principal = 0;
        payment = interest;
      }
    } else {
      // Default to annuity
      payment = Math.min(loan.scheduledPayment, openingBalance + interest);
      principal = payment - interest;
    }

    principal = Math.min(principal, balance);
    balance = Math.max(0, balance - principal);

    cumulativeInterest += interest;
    cumulativePrincipal += principal;

    schedule.push({
      period,
      date: currentDate.toISOString().split("T")[0],
      openingBalance,
      payment,
      principal,
      interest,
      closingBalance: balance,
      cumulativeInterest,
      cumulativePrincipal,
    });

    currentDate = addPaymentPeriod(currentDate, loan.paymentFrequency);
    period++;
  }

  return schedule;
}

function groupByYear(
  schedule: AmortizationRow[],
): Map<number, AmortizationRow[]> {
  const grouped = new Map<number, AmortizationRow[]>();

  schedule.forEach((row) => {
    const year = new Date(row.date).getFullYear();
    const existing = grouped.get(year) || [];
    grouped.set(year, [...existing, row]);
  });

  return grouped;
}

export function LoanScheduleTab({ loan }: LoanScheduleTabProps) {
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  const schedule = useMemo(() => calculateAmortizationSchedule(loan), [loan]);
  const groupedSchedule = useMemo(() => groupByYear(schedule), [schedule]);

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(year)) {
        newSet.delete(year);
      } else {
        newSet.add(year);
      }
      return newSet;
    });
  };

  const exportToCSV = () => {
    const headers = [
      "Period",
      "Date",
      "Opening Balance",
      "Payment",
      "Principal",
      "Interest",
      "Closing Balance",
      "Cumulative Interest",
      "Cumulative Principal",
    ];

    const rows = schedule.map((row) => [
      row.period,
      row.date,
      row.openingBalance.toFixed(2),
      row.payment.toFixed(2),
      row.principal.toFixed(2),
      row.interest.toFixed(2),
      row.closingBalance.toFixed(2),
      row.cumulativeInterest.toFixed(2),
      row.cumulativePrincipal.toFixed(2),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${loan.name.replace(/\s+/g, "_")}_amortization_schedule.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Calculate totals
  const totalPayments = schedule.reduce((sum, row) => sum + row.payment, 0);
  const totalInterest = schedule[schedule.length - 1]?.cumulativeInterest || 0;
  const totalPrincipal =
    schedule[schedule.length - 1]?.cumulativePrincipal || 0;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-1">Total Payments</p>
            <p className="text-xl font-bold">{schedule.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-1">Total Amount</p>
            <p className="text-xl font-bold">
              {formatCurrency(totalPayments, loan.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-1">Total Interest</p>
            <p className="text-xl font-bold text-orange-600">
              {formatCurrency(totalInterest, loan.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground mb-1">Final Payment</p>
            <p className="text-xl font-bold">
              {schedule.length > 0
                ? formatDate(schedule[schedule.length - 1].date)
                : "N/A"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Schedule Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Amortization Schedule</CardTitle>
              <CardDescription>
                Projected payment breakdown for the remaining loan term
              </CardDescription>
            </div>
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {Array.from(groupedSchedule.entries()).map(([year, rows]) => {
              const isExpanded = expandedYears.has(year);
              const yearTotal = rows.reduce((sum, row) => sum + row.payment, 0);
              const yearInterest = rows.reduce(
                (sum, row) => sum + row.interest,
                0,
              );
              const yearPrincipal = rows.reduce(
                (sum, row) => sum + row.principal,
                0,
              );

              return (
                <Collapsible
                  key={year}
                  open={isExpanded}
                  onOpenChange={() => toggleYear(year)}
                >
                  <CollapsibleTrigger asChild>
                    <Button
                      variant="ghost"
                      className="w-full justify-between p-4 h-auto"
                    >
                      <div className="flex items-center gap-4">
                        <ChevronDown
                          className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        />
                        <span className="font-semibold">{year}</span>
                        <Badge variant="secondary">
                          {rows.length} payments
                        </Badge>
                      </div>
                      <div className="flex items-center gap-6 text-sm">
                        <span>
                          <span className="text-muted-foreground">Total: </span>
                          {formatCurrency(yearTotal, loan.currency)}
                        </span>
                        <span className="text-green-600">
                          Principal:{" "}
                          {formatCurrency(yearPrincipal, loan.currency)}
                        </span>
                        <span className="text-orange-600">
                          Interest:{" "}
                          {formatCurrency(yearInterest, loan.currency)}
                        </span>
                      </div>
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border rounded-lg overflow-hidden mt-2">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-16">#</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-right">
                              Opening
                            </TableHead>
                            <TableHead className="text-right">
                              Payment
                            </TableHead>
                            <TableHead className="text-right">
                              Principal
                            </TableHead>
                            <TableHead className="text-right">
                              Interest
                            </TableHead>
                            <TableHead className="text-right">
                              Closing
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((row) => (
                            <TableRow key={row.period}>
                              <TableCell className="font-medium">
                                {row.period}
                              </TableCell>
                              <TableCell>{formatDate(row.date)}</TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(
                                  row.openingBalance,
                                  loan.currency,
                                )}
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(row.payment, loan.currency)}
                              </TableCell>
                              <TableCell className="text-right text-green-600">
                                {formatCurrency(row.principal, loan.currency)}
                              </TableCell>
                              <TableCell className="text-right text-orange-600">
                                {formatCurrency(row.interest, loan.currency)}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatCurrency(
                                  row.closingBalance,
                                  loan.currency,
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
