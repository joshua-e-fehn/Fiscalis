"use client";

import { useState, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { Doc, Id } from "@/convex/_generated/dataModel";
import {
  useRecordPayment,
  useDeletePayment,
  PaymentType,
} from "@/hooks/convex/loans";
import {
  buildLoanSchedule,
  computeNextPaymentDate,
  isExtraPaymentType,
  splitLoanPayment,
  type LoanScheduleRow,
} from "@/../services/finance/loanScheduleService";
import { todayLocalISO } from "@/lib/utils/date";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/shadcn/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
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
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import { Textarea } from "@/components/ui/shadcn/textarea";
import {
  Plus,
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

// Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "scheduled", label: "Scheduled Payment" },
  { value: "additional_principal", label: "Additional Principal" },
  { value: "prepayment", label: "Prepayment" },
  { value: "partial", label: "Partial Payment" },
  { value: "late", label: "Late Payment" },
];

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
}: LoanPaymentsScheduleTabProps) {
  const { user } = useUser();
  const { recordPayment } = useRecordPayment();
  const { deletePayment } = useDeletePayment();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => {
    const currentYear = Number(todayLocalISO().slice(0, 4));
    return new Set([currentYear]);
  });

  // Form state
  const [paymentDate, setPaymentDate] = useState(todayLocalISO);
  const [amount, setAmount] = useState("");
  const [principalPortion, setPrincipalPortion] = useState("");
  const [interestPortion, setInterestPortion] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("scheduled");
  const [notes, setNotes] = useState("");

  // Full schedule combining past payments and future projections
  const fullSchedule = useMemo(
    () => buildLoanSchedule(loan, payments, todayLocalISO()),
    [loan, payments],
  );
  const nextDueDate = useMemo(
    () => computeNextPaymentDate(loan, payments),
    [loan, payments],
  );
  const groupedSchedule = useMemo(
    () => groupByYear(fullSchedule),
    [fullSchedule],
  );
  const nextScheduledPayment =
    fullSchedule.find((r) => r.status === "scheduled")?.payment ??
    loan.scheduledPayment;

  // Auto-calculate principal/interest split
  const calculateSplit = () => {
    const split = splitLoanPayment(loan, parseFloat(amount) || 0, paymentType);
    setPrincipalPortion(split.principalPortion.toFixed(2));
    setInterestPortion(split.interestPortion.toFixed(2));
  };

  const resetForm = () => {
    setPaymentDate(todayLocalISO());
    setPrincipalPortion("");
    setInterestPortion("");
    setPaymentType("scheduled");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    const totalAmount = parseFloat(amount);
    // Keeps whichever portion was entered; principal is capped at the balance
    const split = splitLoanPayment(loan, totalAmount, paymentType, {
      principal: parseFloat(principalPortion),
      interest: parseFloat(interestPortion),
    });

    setIsSubmitting(true);
    try {
      await recordPayment({
        userId: user.id,
        loanId: loan._id,
        paymentDate,
        amount: totalAmount,
        ...split,
        paymentType,
        notes: notes || undefined,
      });
      resetForm();
      setShowAddDialog(false);
    } catch (error) {
      console.error("Failed to record payment:", error);
    } finally {
      setIsSubmitting(false);
    }
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
    const headers = [
      "Period",
      "Date",
      "Due Date",
      "Status",
      "Type",
      "Opening Balance",
      "Payment",
      "Principal",
      "Interest",
      "Closing Balance",
      "Cumulative Interest",
      "Cumulative Principal",
    ];

    const rows = fullSchedule.map((row) => [
      row.period,
      row.date,
      row.dueDate ?? "",
      row.status === "paid"
        ? "Paid"
        : row.status === "extra"
          ? "Extra Payment"
          : row.overdue
            ? "Overdue"
            : "Scheduled",
      row.paymentType || "scheduled",
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
  const paidRows = fullSchedule.filter(
    (r) => r.status === "paid" || r.status === "extra",
  );
  const scheduledRows = fullSchedule.filter((r) => r.status === "scheduled");

  const totalPrincipalPaid = paidRows.reduce((sum, r) => sum + r.principal, 0);
  const totalInterestPaid = paidRows.reduce((sum, r) => sum + r.interest, 0);
  const totalAmountPaid = paidRows.reduce((sum, r) => sum + r.payment, 0);

  const totalScheduledPayments = scheduledRows.reduce(
    (sum, r) => sum + r.payment,
    0,
  );

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <Check className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">Total Paid</span>
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(totalAmountPaid, loan.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {paidRows.length} payments
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">
                Principal Paid
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
                Interest Paid
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
              <span className="text-sm text-muted-foreground">Remaining</span>
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(totalScheduledPayments, loan.currency)}
            </p>
            <p className="text-xs text-muted-foreground">
              {scheduledRows.length} payments left
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
                Payment Schedule
              </CardTitle>
              <CardDescription>
                Complete loan amortization with recorded payments and future
                projections
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button
                onClick={() => {
                  setAmount(nextScheduledPayment.toString());
                  setShowAddDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Record Payment
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {fullSchedule.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                No schedule data available
              </p>
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
                                {paidInYear.length} paid
                              </Badge>
                            )}
                            {extraInYear.length > 0 && (
                              <Badge className="bg-blue-100 text-blue-700">
                                <Plus className="h-3 w-3 mr-1" />
                                {extraInYear.length} prepayment
                              </Badge>
                            )}
                            {overdueInYear.length > 0 && (
                              <Badge className="bg-red-100 text-red-700">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                {overdueInYear.length} overdue
                              </Badge>
                            )}
                            {scheduledInYear.length > overdueInYear.length && (
                              <Badge variant="secondary">
                                <CircleDashed className="h-3 w-3 mr-1" />
                                {scheduledInYear.length -
                                  overdueInYear.length}{" "}
                                scheduled
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-6 text-sm">
                          {(paidTotal > 0 || extraTotal > 0) && (
                            <div className="flex flex-col items-end text-green-600">
                              <span className="font-medium">
                                Paid:{" "}
                                {formatCurrency(
                                  paidTotal + extraTotal,
                                  loan.currency,
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                Principal:{" "}
                                {formatCurrency(
                                  paidPrincipal + extraPrincipal,
                                  loan.currency,
                                )}{" "}
                                · Interest:{" "}
                                {formatCurrency(paidInterest, loan.currency)}
                                {extraTotal > 0 &&
                                  ` · Extra: ${formatCurrency(extraTotal, loan.currency)}`}
                              </span>
                            </div>
                          )}
                          {scheduledTotal > 0 && (
                            <div className="flex flex-col items-end text-muted-foreground">
                              <span className="font-medium">
                                Scheduled:{" "}
                                {formatCurrency(scheduledTotal, loan.currency)}
                              </span>
                              <span className="text-xs">
                                Principal:{" "}
                                {formatCurrency(
                                  scheduledPrincipal,
                                  loan.currency,
                                )}{" "}
                                · Interest:{" "}
                                {formatCurrency(
                                  scheduledInterest,
                                  loan.currency,
                                )}
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
                              <TableHead>Date</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="text-right">
                                Opening Balance
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
                                Closing Balance
                              </TableHead>
                              <TableHead className="w-12"></TableHead>
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
                                      Due {formatDate(row.dueDate)}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {row.overdue ? (
                                    <Badge className="bg-red-100 text-red-700 hover:bg-red-100">
                                      <AlertCircle className="h-3 w-3 mr-1" />
                                      Overdue
                                    </Badge>
                                  ) : row.status === "paid" ? (
                                    <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                                      <CheckCircle2 className="h-3 w-3 mr-1" />
                                      Paid
                                    </Badge>
                                  ) : row.status === "extra" ? (
                                    <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
                                      <Plus className="h-3 w-3 mr-1" />
                                      Prepayment
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary">
                                      <CircleDashed className="h-3 w-3 mr-1" />
                                      Scheduled
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
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button
                                            variant="ghost"
                                            size="sm"
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
                                              Delete Payment
                                            </AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Are you sure you want to delete
                                              this payment? This will restore
                                              the loan balance and cannot be
                                              undone.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>
                                              Cancel
                                            </AlertDialogCancel>
                                            <AlertDialogAction
                                              onClick={() =>
                                                handleDelete(row.paymentId!)
                                              }
                                              className="bg-red-600 hover:bg-red-700"
                                            >
                                              Delete
                                            </AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
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

      {/* Add Payment Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>
              Record a payment for {loan.name}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="payment-date">Payment Date</Label>
                <Input
                  id="payment-date"
                  type="date"
                  max={todayLocalISO()}
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="payment-type">Payment Type</Label>
                <Select
                  value={paymentType}
                  onValueChange={(v) => setPaymentType(v as PaymentType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {nextDueDate && !isExtraPaymentType(paymentType) && (
              <p className="text-sm text-muted-foreground">
                Covers the payment due {formatDate(nextDueDate)}.
              </p>
            )}

            <div>
              <Label htmlFor="payment-amount">Total Amount</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="payment-amount"
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-7"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={calculateSplit}
                >
                  Calculate Split
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="principal-portion">Principal Portion</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="principal-portion"
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-7"
                    placeholder="Auto"
                    value={principalPortion}
                    onChange={(e) => setPrincipalPortion(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="interest-portion">Interest Portion</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    $
                  </span>
                  <Input
                    id="interest-portion"
                    type="number"
                    step="0.01"
                    min="0"
                    className="pl-7"
                    placeholder="Auto"
                    value={interestPortion}
                    onChange={(e) => setInterestPortion(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label htmlFor="payment-notes">Notes (optional)</Label>
              <Textarea
                id="payment-notes"
                placeholder="Any notes about this payment..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowAddDialog(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={!(parseFloat(amount) > 0) || isSubmitting}
              >
                {isSubmitting && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                Record Payment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
