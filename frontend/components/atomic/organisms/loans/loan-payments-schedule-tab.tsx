"use client";

import { useState, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Doc, Id } from "@/convex/_generated/dataModel";
import { useDeletePayment } from "@/hooks/convex/loans";
import {
  buildLoanSchedule,
  type LoanKpis,
  type LoanScheduleRow,
} from "@/../services/finance/loanScheduleService";
import { todayLocalISO } from "@/lib/utils/date";
import { downloadCSV } from "@/lib/utils/export";
import { formatCurrency as formatMoney } from "@/lib/utils/currency";
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
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/shadcn/collapsible";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import { LoanPaymentDialog } from "./loan-payment-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Calendar,
  TrendingDown,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  Download,
  Clock,
  Check,
  CheckCircle2,
  CircleDashed,
} from "lucide-react";

type Loan = Doc<"loans">;
type LoanPayment = Doc<"loanPayments">;

interface LoanPaymentsScheduleTabProps {
  loan: Loan;
  payments: LoanPayment[];
  /** The page's KPIs (loanKpis), so every view shows the same numbers. */
  kpis: LoanKpis;
}

// Helper functions
function formatCurrency(value: number, currency: string = "USD"): string {
  return formatMoney(value, currency);
}

function groupByYear(
  schedule: LoanScheduleRow[],
): Map<number, LoanScheduleRow[]> {
  const grouped = new Map<number, LoanScheduleRow[]>();

  schedule.forEach((row) => {
    const year = Number(row.date.slice(0, 4));
    const existing = grouped.get(year) || [];
    grouped.set(year, [...existing, row]);
  });

  return new Map([...grouped.entries()].sort(([a], [b]) => a - b));
}

export function LoanPaymentsScheduleTab({
  loan,
  payments,
  kpis,
}: LoanPaymentsScheduleTabProps) {
  const t = useTranslations("loans.schedule");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  // Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight
  const formatDate = (date: string) =>
    format.dateTime(new Date(date), "dateOnly");
  const { deletePayment } = useDeletePayment();

  const [showAddDialog, setShowAddDialog] = useState(false);
  // The recorded payment being edited, and the due date it covers. Kept
  // while the dialog closes, so it doesn't turn into the record form.
  const [editing, setEditing] = useState<{
    payment: LoanPayment;
    dueDate: string | null;
  } | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => {
    const currentYear = Number(todayLocalISO().slice(0, 4));
    return new Set([currentYear]);
  });

  // Full schedule combining past payments and future projections
  const fullSchedule = useMemo(
    () => buildLoanSchedule(loan, payments, todayLocalISO()),
    [loan, payments],
  );
  const nextDueDate = kpis.nextPayment?.dueDate ?? null;
  const groupedSchedule = useMemo(
    () => groupByYear(fullSchedule),
    [fullSchedule],
  );
  const nextScheduledPayment = kpis.nextPayment?.amount ?? 0;

  const openEdit = (paymentId: string, dueDate: string | undefined) => {
    const payment = payments.find((p) => p._id === paymentId);
    if (!payment) return;
    setEditing({ payment, dueDate: dueDate ?? null });
    setShowEditDialog(true);
  };

  const handleDelete = async (paymentId: string) => {
    setDeletingId(paymentId);
    try {
      await deletePayment(paymentId as Id<"loanPayments">);
    } catch (error) {
      console.error("Failed to delete payment:", error);
    } finally {
      setDeletingId(null);
    }
  };

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
    const headers = (
      [
        "period",
        "date",
        "dueDate",
        "status",
        "type",
        "openingBalance",
        "payment",
        "principal",
        "interest",
        "closingBalance",
        "cumulativeInterest",
        "cumulativePrincipal",
      ] as const
    ).map((column) => t(`csv.${column}`));

    const rows = fullSchedule.map((row) => [
      row.period,
      row.date,
      row.dueDate ?? "",
      t(
        row.status === "paid"
          ? "csv.paid"
          : row.status === "extra"
            ? "csv.extra"
            : row.overdue
              ? "csv.overdue"
              : "csv.scheduled",
      ),
      t(`paymentTypes.${row.paymentType || "scheduled"}`),
      row.openingBalance.toFixed(2),
      row.payment.toFixed(2),
      row.principal.toFixed(2),
      row.interest.toFixed(2),
      row.closingBalance.toFixed(2),
      row.cumulativeInterest.toFixed(2),
      row.cumulativePrincipal.toFixed(2),
    ]);

    downloadCSV(
      headers,
      rows,
      `${t("csv.fileName", { name: loan.name.replace(/\s+/g, "_") })}.csv`,
    );
  };

  // Totals (the same KPIs as the page header and the Overview tab)
  const {
    totalPaid: totalAmountPaid,
    principalRepaid: totalPrincipalPaid,
    interestPaid: totalInterestPaid,
    remainingPayments: totalScheduledPayments,
    remainingPeriods,
  } = kpis;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">
                {t("totalPaid")}
              </span>
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(totalAmountPaid, loan.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("paymentsCount", { count: payments.length })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">
                {t("principalRepaid")}
              </span>
            </div>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(totalPrincipalPaid, loan.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-muted-foreground">
                {t("interestPaid")}
              </span>
            </div>
            <p className="text-2xl font-bold text-orange-600">
              {formatCurrency(totalInterestPaid, loan.currency)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {t("remaining")}
              </span>
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(totalScheduledPayments, loan.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("paymentsLeft", { count: remainingPeriods })}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Full Amortization Schedule */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                {t("title")}
              </CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                {t("exportCsv")}
              </Button>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t("recordPayment")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {fullSchedule.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">{t("noData")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {Array.from(groupedSchedule.entries()).map(([year, rows]) => {
                const isExpanded = expandedYears.has(year);
                const paidInYear = rows.filter((r) => r.status === "paid");
                const extraInYear = rows.filter((r) => r.status === "extra");
                const scheduledInYear = rows.filter(
                  (r) => r.status === "scheduled",
                );
                const overdueInYear = scheduledInYear.filter((r) => r.overdue);

                // Calculate totals for paid payments
                const paidTotal = paidInYear.reduce(
                  (sum, r) => sum + r.payment,
                  0,
                );
                const paidPrincipal = paidInYear.reduce(
                  (sum, r) => sum + r.principal,
                  0,
                );
                const paidInterest = paidInYear.reduce(
                  (sum, r) => sum + r.interest,
                  0,
                );

                // Calculate totals for extra payments
                const extraTotal = extraInYear.reduce(
                  (sum, r) => sum + r.payment,
                  0,
                );
                const extraPrincipal = extraInYear.reduce(
                  (sum, r) => sum + r.principal,
                  0,
                );

                // Calculate totals for scheduled payments
                const scheduledTotal = scheduledInYear.reduce(
                  (sum, r) => sum + r.payment,
                  0,
                );
                const scheduledPrincipal = scheduledInYear.reduce(
                  (sum, r) => sum + r.principal,
                  0,
                );
                const scheduledInterest = scheduledInYear.reduce(
                  (sum, r) => sum + r.interest,
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
                          <div className="flex gap-2">
                            {paidInYear.length > 0 && (
                              <Badge className="bg-green-100 text-green-700">
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                {t("yearPaidCount", {
                                  count: paidInYear.length,
                                })}
                              </Badge>
                            )}
                            {extraInYear.length > 0 && (
                              <Badge className="bg-blue-100 text-blue-700">
                                <Plus className="h-3 w-3 mr-1" />
                                {t("yearPrepaymentCount", {
                                  count: extraInYear.length,
                                })}
                              </Badge>
                            )}
                            {overdueInYear.length > 0 && (
                              <Badge className="bg-red-100 text-red-700">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                {t("yearOverdueCount", {
                                  count: overdueInYear.length,
                                })}
                              </Badge>
                            )}
                            {scheduledInYear.length > overdueInYear.length && (
                              <Badge variant="secondary">
                                <CircleDashed className="h-3 w-3 mr-1" />
                                {t("yearScheduledCount", {
                                  count:
                                    scheduledInYear.length -
                                    overdueInYear.length,
                                })}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          {(paidTotal > 0 || extraTotal > 0) && (
                            <div className="flex flex-col items-end text-green-600">
                              <span className="font-medium">
                                {t("yearPaid", {
                                  amount: formatCurrency(
                                    paidTotal + extraTotal,
                                    loan.currency,
                                  ),
                                })}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {t(
                                  extraTotal > 0
                                    ? "yearSplitWithExtra"
                                    : "yearSplit",
                                  {
                                    principal: formatCurrency(
                                      paidPrincipal + extraPrincipal,
                                      loan.currency,
                                    ),
                                    interest: formatCurrency(
                                      paidInterest,
                                      loan.currency,
                                    ),
                                    extra: formatCurrency(
                                      extraTotal,
                                      loan.currency,
                                    ),
                                  },
                                )}
                              </span>
                            </div>
                          )}
                          {scheduledTotal > 0 && (
                            <div className="flex flex-col items-end text-muted-foreground">
                              <span className="font-medium">
                                {t("yearScheduled", {
                                  amount: formatCurrency(
                                    scheduledTotal,
                                    loan.currency,
                                  ),
                                })}
                              </span>
                              <span className="text-xs">
                                {t("yearSplit", {
                                  principal: formatCurrency(
                                    scheduledPrincipal,
                                    loan.currency,
                                  ),
                                  interest: formatCurrency(
                                    scheduledInterest,
                                    loan.currency,
                                  ),
                                })}
                              </span>
                            </div>
                          )}
                        </div>
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border rounded-lg overflow-hidden mt-2">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-16">#</TableHead>
                              <TableHead>{t("columns.date")}</TableHead>
                              <TableHead>{t("columns.status")}</TableHead>
                              <TableHead className="text-right">
                                {t("columns.openingBalance")}
                              </TableHead>
                              <TableHead className="text-right">
                                {t("columns.payment")}
                              </TableHead>
                              <TableHead className="text-right">
                                {t("columns.principal")}
                              </TableHead>
                              <TableHead className="text-right">
                                {t("columns.interest")}
                              </TableHead>
                              <TableHead className="text-right">
                                {t("columns.closingBalance")}
                              </TableHead>
                              <TableHead className="w-24"></TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {rows.map((row) => (
                              <TableRow
                                key={row.paymentId ?? `due-${row.dueDate}`}
                                className={
                                  row.status === "scheduled" && !row.overdue
                                    ? "opacity-60 bg-muted/30"
                                    : ""
                                }
                              >
                                <TableCell className="font-medium">
                                  {row.period}
                                </TableCell>
                                <TableCell>
                                  {formatDate(row.date)}
                                  {row.dueDate && row.dueDate !== row.date && (
                                    <span className="block text-xs text-muted-foreground">
                                      {t("dueOn", {
                                        date: formatDate(row.dueDate),
                                      })}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {row.overdue ? (
                                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      {t("rowStatus.overdue")}
                                    </Badge>
                                  ) : row.status === "paid" ? (
                                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      {t("rowStatus.paid")}
                                    </Badge>
                                  ) : row.status === "extra" ? (
                                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                                      <Plus className="h-3 w-3 mr-1" />
                                      {t("rowStatus.prepayment")}
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">
                                      <CircleDashed className="h-3 w-3 mr-1" />
                                      {t("rowStatus.scheduled")}
                                    </Badge>
                                  )}
                                </TableCell>
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
                                <TableCell>
                                  {(row.status === "paid" ||
                                    row.status === "extra") &&
                                    row.paymentId && (
                                      <div className="flex justify-end">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          aria-label={t("editPayment")}
                                          title={t("editPayment")}
                                          onClick={() =>
                                            openEdit(
                                              row.paymentId!,
                                              row.dueDate,
                                            )
                                          }
                                        >
                                          <Pencil className="h-4 w-4" />
                                        </Button>
                                        <AlertDialog>
                                          <AlertDialogTrigger asChild>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              aria-label={t("deletePayment")}
                                              title={t("deletePayment")}
                                              disabled={
                                                deletingId === row.paymentId
                                              }
                                            >
                                              {deletingId === row.paymentId ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                              ) : (
                                                <Trash2 className="h-4 w-4 text-red-500" />
                                              )}
                                            </Button>
                                          </AlertDialogTrigger>
                                          <AlertDialogContent>
                                            <AlertDialogHeader>
                                              <AlertDialogTitle>
                                                {t("deleteTitle")}
                                              </AlertDialogTitle>
                                              <AlertDialogDescription>
                                                {t("deleteDescription")}
                                              </AlertDialogDescription>
                                            </AlertDialogHeader>
                                            <AlertDialogFooter>
                                              <AlertDialogCancel>
                                                {tActions("cancel")}
                                              </AlertDialogCancel>
                                              <AlertDialogAction
                                                onClick={() =>
                                                  handleDelete(row.paymentId!)
                                                }
                                                className="bg-red-600 hover:bg-red-700"
                                              >
                                                {tActions("delete")}
                                              </AlertDialogAction>
                                            </AlertDialogFooter>
                                          </AlertDialogContent>
                                        </AlertDialog>
                                      </div>
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
          )}
        </CardContent>
      </Card>

      <LoanPaymentDialog
        loan={loan}
        payments={payments}
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        defaultAmount={nextScheduledPayment}
        coversDueDate={nextDueDate}
      />
      <LoanPaymentDialog
        loan={loan}
        payments={payments}
        open={showEditDialog && editing !== null}
        onOpenChange={setShowEditDialog}
        payment={editing?.payment}
        coversDueDate={editing?.dueDate}
      />
    </div>
  );
}
