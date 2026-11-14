"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Doc } from "@/convex/_generated/dataModel";
import {
  useRecordPayment,
  useUpdatePayment,
  PaymentType,
} from "@/hooks/convex/loans";
import {
  editedPaymentSplitBasis,
  isExtraPaymentType,
  paymentSplitBasis,
  splitLoanPayment,
} from "@/../services/finance/loanScheduleService";
import { useErrorMessage } from "@/i18n/errors";
import { todayLocalISO } from "@/lib/utils/date";
import { currencySymbols, toInvestmentCurrency } from "@/lib/utils/currency";
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
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Button } from "@/components/ui/shadcn/button";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { AlertCircle, Loader2 } from "lucide-react";

type Loan = Doc<"loans">;
type LoanPayment = Doc<"loanPayments">;

/** The types a user can pick; "final" is set by the server on payoff. */
const SELECTABLE_PAYMENT_TYPES: PaymentType[] = [
  "scheduled",
  "additional_principal",
  "prepayment",
  "partial",
  "late",
];

interface LoanPaymentDialogProps {
  loan: Loan;
  payments: LoanPayment[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The payment to edit; records a new payment when absent. */
  payment?: LoanPayment | null;
  /** Amount pre-filled when recording (the next scheduled payment). */
  defaultAmount?: number;
  /** The due date a regular payment covers, shown as a hint. */
  coversDueDate?: string | null;
}

/**
 * Records a loan payment, or edits a recorded one. Both use the same form
 * and the same split as the server (loans.recordPayment /
 * loans.updatePayment): an edit is split as if the payment had never been
 * made. Errors stay in the dialog.
 */
export function LoanPaymentDialog({
  open,
  onOpenChange,
  ...formProps
}: LoanPaymentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted per opening, so the form starts from the props */}
        <LoanPaymentForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function LoanPaymentForm({
  loan,
  payments,
  payment,
  defaultAmount,
  coversDueDate,
  onDone,
}: Omit<LoanPaymentDialogProps, "open" | "onOpenChange"> & {
  onDone: () => void;
}) {
  const t = useTranslations("loans.schedule");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const { recordPayment } = useRecordPayment();
  const { updatePayment } = useUpdatePayment();
  const isEdit = !!payment;

  const [paymentDate, setPaymentDate] = useState(
    () => payment?.paymentDate ?? todayLocalISO(),
  );
  const [amount, setAmount] = useState(() =>
    payment ? payment.amount.toString() : (defaultAmount?.toString() ?? ""),
  );
  const [principalPortion, setPrincipalPortion] = useState(
    () => payment?.principalPortion.toFixed(2) ?? "",
  );
  const [interestPortion, setInterestPortion] = useState(
    () => payment?.interestPortion.toFixed(2) ?? "",
  );
  const [paymentType, setPaymentType] = useState<PaymentType>(
    () => payment?.paymentType ?? "scheduled",
  );
  const [notes, setNotes] = useState(() => payment?.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A "final" payment keeps its type in the list while it is edited
  const paymentTypes =
    payment?.paymentType === "final"
      ? [...SELECTABLE_PAYMENT_TYPES, "final" as const]
      : SELECTABLE_PAYMENT_TYPES;

  const currency = toInvestmentCurrency(loan.currency);
  const symbol = currency ? currencySymbols[currency].trim() : loan.currency;
  const inputPadding = symbol.length > 1 ? "pl-12" : "pl-7";

  // Interest is one period on the balance owed on the payment date, less
  // what partial payments already booked for that due date; an edit is split
  // without the payment itself. Same basis as the server.
  const splitBasis = () =>
    payment
      ? editedPaymentSplitBasis(loan, payments, payment._id, paymentDate).basis
      : paymentSplitBasis(loan, payments, paymentDate);
  // Fees can't be entered here; an edit keeps the recorded ones
  const fees = payment?.feesPortion;

  const calculateSplit = () => {
    const split = splitLoanPayment(
      splitBasis(),
      parseFloat(amount) || 0,
      paymentType,
      { fees },
    );
    setPrincipalPortion(split.principalPortion.toFixed(2));
    setInterestPortion(split.interestPortion.toFixed(2));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Keeps whichever portion was entered; principal is capped at the balance
    const split = splitLoanPayment(
      splitBasis(),
      parseFloat(amount),
      paymentType,
      {
        principal: parseFloat(principalPortion),
        interest: parseFloat(interestPortion),
        fees,
      },
    );

    setIsSubmitting(true);
    setError(null);
    try {
      // Reconciled: amount = principal + interest (+ fees); an overpayment
      // past the balance isn't booked
      const values = {
        paymentDate,
        amount: split.amount,
        principalPortion: split.principalPortion,
        interestPortion: split.interestPortion,
        paymentType,
      };
      if (payment) {
        // Sent only when changed, so an emptied note is cleared
        await updatePayment({
          paymentId: payment._id,
          ...values,
          notes: notes !== (payment.notes ?? "") ? notes : undefined,
        });
      } else {
        await recordPayment({
          loanId: loan._id,
          ...values,
          notes: notes || undefined,
        });
      }
      onDone();
    } catch (err) {
      console.error("Failed to save payment:", err);
      setError(errorMessage(err, "saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? t("editTitle") : t("recordPayment")}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? t("editDescription", { loan: loan.name })
            : t("recordDescription", { loan: loan.name })}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="payment-date">{t("paymentDate")}</Label>
            <Input
              id="payment-date"
              type="date"
              max={todayLocalISO()}
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="payment-type">{t("paymentType")}</Label>
            <Select
              value={paymentType}
              onValueChange={(v) => setPaymentType(v as PaymentType)}
            >
              <SelectTrigger id="payment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {paymentTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {t(`paymentTypes.${type}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {coversDueDate && !isExtraPaymentType(paymentType) && (
          <p className="text-sm text-muted-foreground">
            {t("covers", {
              date: format.dateTime(new Date(coversDueDate), "dateOnly"),
            })}
          </p>
        )}

        <div>
          <Label htmlFor="payment-amount">{t("totalAmount")}</Label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {symbol}
              </span>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                className={inputPadding}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Button type="button" variant="outline" onClick={calculateSplit}>
              {t("calculateSplit")}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="principal-portion">{t("principalPortion")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {symbol}
              </span>
              <Input
                id="principal-portion"
                type="number"
                step="0.01"
                min="0"
                className={inputPadding}
                placeholder={t("auto")}
                value={principalPortion}
                onChange={(e) => setPrincipalPortion(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="interest-portion">{t("interestPortion")}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {symbol}
              </span>
              <Input
                id="interest-portion"
                type="number"
                step="0.01"
                min="0"
                className={inputPadding}
                placeholder={t("auto")}
                value={interestPortion}
                onChange={(e) => setInterestPortion(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div>
          <Label htmlFor="payment-notes">{t("notes")}</Label>
          <Textarea
            id="payment-notes"
            placeholder={t("notesPlaceholder")}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && (
          <p
            role="alert"
            className="flex items-center gap-2 text-sm text-destructive"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {tActions("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!(parseFloat(amount) > 0) || isSubmitting}
          >
            {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? t("editSubmit") : t("recordPayment")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
