"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { Doc } from "@/convex/_generated/dataModel";
import {
  useRecordPayment,
  useDeletePayment,
  PaymentType,
} from "@/hooks/convex/loans";
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
  DollarSign,
  TrendingDown,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

type Loan = Doc<"loans">;
type LoanPayment = Doc<"loanPayments">;

interface LoanPaymentsTabProps {
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getPaymentTypeBadge(type: string) {
  switch (type) {
    case "scheduled":
      return <Badge variant="outline">Scheduled</Badge>;
    case "additional_principal":
      return (
        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
          + Principal
        </Badge>
      );
    case "prepayment":
      return (
        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100">
          Prepayment
        </Badge>
      );
    case "final":
      return (
        <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-100">
          Final
        </Badge>
      );
    case "partial":
      return (
        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
          Partial
        </Badge>
      );
    case "late":
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Late</Badge>
      );
    default:
      return <Badge variant="secondary">{type}</Badge>;
  }
}

const PAYMENT_TYPES: { value: PaymentType; label: string }[] = [
  { value: "scheduled", label: "Scheduled Payment" },
  { value: "additional_principal", label: "Additional Principal" },
  { value: "prepayment", label: "Prepayment" },
  { value: "partial", label: "Partial Payment" },
  { value: "late", label: "Late Payment" },
];

export function LoanPaymentsTab({ loan, payments }: LoanPaymentsTabProps) {
  const { user } = useUser();
  const { recordPayment } = useRecordPayment();
  const { deletePayment } = useDeletePayment();
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Form state
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [amount, setAmount] = useState(loan.scheduledPayment.toString());
  const [principalPortion, setPrincipalPortion] = useState("");
  const [interestPortion, setInterestPortion] = useState("");
  const [paymentType, setPaymentType] = useState<PaymentType>("scheduled");
  const [notes, setNotes] = useState("");

  // Auto-calculate principal/interest split
  const calculateSplit = () => {
    const totalAmount = parseFloat(amount) || 0;

    // Additional principal and prepayments go 100% to principal
    if (
      paymentType === "additional_principal" ||
      paymentType === "prepayment"
    ) {
      setPrincipalPortion(totalAmount.toFixed(2));
      setInterestPortion("0.00");
      return;
    }

    // Regular/scheduled payments have interest calculated based on current balance
    const paymentsPerYear =
      loan.paymentFrequency === "MONTHLY"
        ? 12
        : loan.paymentFrequency === "QUARTERLY"
          ? 4
          : loan.paymentFrequency === "SEMI_ANNUAL"
            ? 2
            : 1;
    const periodicRate = loan.annualInterestRate / paymentsPerYear;
    const interestAmount = loan.currentBalance * periodicRate;
    const principalAmount = Math.max(0, totalAmount - interestAmount);

    setPrincipalPortion(principalAmount.toFixed(2));
    setInterestPortion(interestAmount.toFixed(2));
  };

  const resetForm = () => {
    setPaymentDate(new Date().toISOString().split("T")[0]);
    setAmount(loan.scheduledPayment.toString());
    setPrincipalPortion("");
    setInterestPortion("");
    setPaymentType("scheduled");
    setNotes("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      await recordPayment({
        userId: user.id,
        loanId: loan._id,
        paymentDate,
        amount: parseFloat(amount),
        principalPortion: parseFloat(principalPortion),
        interestPortion: parseFloat(interestPortion),
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
      await deletePayment(paymentId as any);
    } catch (error) {
      console.error("Failed to delete payment:", error);
    } finally {
      setDeletingId(null);
    }
  };

  // Calculate totals
  const totalPrincipalPaid = payments.reduce(
    (sum, p) => sum + p.principalPortion,
    0,
  );
  const totalInterestPaid = payments.reduce(
    (sum, p) => sum + p.interestPortion,
    0,
  );
  const totalAmountPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Paid</span>
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(totalAmountPaid, loan.currency)}
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
      </div>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Payment History</CardTitle>
              <CardDescription>
                {payments.length} payments recorded
              </CardDescription>
            </div>
            <Button onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <div className="text-center py-8">
              <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground mb-4">
                No payments recorded yet
              </p>
              <Button onClick={() => setShowAddDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Record Your First Payment
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Principal</TableHead>
                  <TableHead className="text-right">Interest</TableHead>
                  <TableHead className="text-right">Balance After</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment._id}>
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell>
                      {getPaymentTypeBadge(payment.paymentType)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(payment.amount, loan.currency)}
                    </TableCell>
                    <TableCell className="text-right text-green-600">
                      {formatCurrency(payment.principalPortion, loan.currency)}
                    </TableCell>
                    <TableCell className="text-right text-orange-600">
                      {formatCurrency(payment.interestPortion, loan.currency)}
                    </TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(
                        payment.balanceAfterPayment,
                        loan.currency,
                      )}
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={deletingId === payment._id}
                          >
                            {deletingId === payment._id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4 text-red-500" />
                            )}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Payment</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete this payment? This
                              will restore the loan balance and cannot be
                              undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleDelete(payment._id)}
                              className="bg-red-600 hover:bg-red-700"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                disabled={
                  !amount ||
                  !principalPortion ||
                  !interestPortion ||
                  isSubmitting
                }
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
