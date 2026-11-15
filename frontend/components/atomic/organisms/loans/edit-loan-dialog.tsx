"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Doc } from "@/convex/_generated/dataModel";
import { useUpdateLoan, LoanStatus } from "@/hooks/convex/loans";
import {
  scheduledPaymentAfterEdit,
  type DayCountConvention,
} from "@/../services/finance/loanScheduleService";
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
import { Loader2 } from "lucide-react";
import { DayCountSelect } from "@/components/atomic/molecules/loans/day-count-select";

type Loan = Doc<"loans">;

interface EditLoanDialogProps {
  loan: Loan;
  payments: Doc<"loanPayments">[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUSES: LoanStatus[] = ["active", "paid_off", "defaulted", "refinanced"];

export function EditLoanDialog({
  loan,
  payments,
  open,
  onOpenChange,
}: EditLoanDialogProps) {
  const t = useTranslations("loans.edit");
  const tLoans = useTranslations("loans");
  const tActions = useTranslations("common.actions");
  const { updateLoan } = useUpdateLoan();
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [name, setName] = useState(loan.name);
  const [currentBalance, setCurrentBalance] = useState(
    loan.currentBalance.toString(),
  );
  const [annualInterestRate, setAnnualInterestRate] = useState(
    (loan.annualInterestRate * 100).toString(),
  );
  const [scheduledPayment, setScheduledPayment] = useState(
    loan.scheduledPayment.toString(),
  );
  // Until the user types a payment, a rate or balance edit re-derives it over
  // the remaining periods (the same rule updateLoan applies)
  const [paymentEdited, setPaymentEdited] = useState(false);
  const [status, setStatus] = useState<LoanStatus>(loan.status);
  const [dayCount, setDayCount] = useState<DayCountConvention | undefined>(
    loan.dayCount,
  );
  const [lender, setLender] = useState(loan.lender ?? "");
  const [contractNumber, setContractNumber] = useState(
    loan.contractNumber ?? "",
  );
  const [collateral, setCollateral] = useState(loan.collateral ?? "");
  const [notes, setNotes] = useState(loan.notes ?? "");

  // Reset form when loan changes
  useEffect(() => {
    setName(loan.name);
    setCurrentBalance(loan.currentBalance.toString());
    setAnnualInterestRate((loan.annualInterestRate * 100).toString());
    setScheduledPayment(loan.scheduledPayment.toString());
    setPaymentEdited(false);
    setStatus(loan.status);
    setDayCount(loan.dayCount);
    setLender(loan.lender ?? "");
    setContractNumber(loan.contractNumber ?? "");
    setCollateral(loan.collateral ?? "");
    setNotes(loan.notes ?? "");
  }, [loan]);

  const balanceValue = parseFloat(currentBalance);
  const rateValue = parseFloat(annualInterestRate) / 100;
  useEffect(() => {
    if (paymentEdited) return;
    setScheduledPayment(
      scheduledPaymentAfterEdit(loan, payments, {
        currentBalance: Number.isFinite(balanceValue) ? balanceValue : undefined,
        annualInterestRate: Number.isFinite(rateValue) ? rateValue : undefined,
      }).toString(),
    );
  }, [loan, payments, balanceValue, rateValue, paymentEdited]);
  const paymentRederived =
    !paymentEdited && parseFloat(scheduledPayment) !== loan.scheduledPayment;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await updateLoan({
        loanId: loan._id,
        name,
        currentBalance: parseFloat(currentBalance),
        annualInterestRate: parseFloat(annualInterestRate) / 100,
        scheduledPayment: parseFloat(scheduledPayment),
        status,
        // null clears a convention back to equal periods
        dayCount: dayCount ?? null,
        lender: lender || undefined,
        contractNumber: contractNumber || undefined,
        collateral: collateral || undefined,
        notes: notes || undefined,
      });
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to update loan:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-name">{t("name")}</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-balance">{t("currentBalance")}</Label>
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {loan.currency}
                </span>
                <Input
                  id="edit-balance"
                  type="number"
                  step="0.01"
                  min="0"
                  className="ps-12"
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-rate">{t("interestRate")}</Label>
              <div className="relative">
                <Input
                  id="edit-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="pe-7"
                  value={annualInterestRate}
                  onChange={(e) => setAnnualInterestRate(e.target.value)}
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-payment">{t("scheduledPayment")}</Label>
              <div className="relative">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                  {loan.currency}
                </span>
                <Input
                  id="edit-payment"
                  type="number"
                  step="0.01"
                  min="0"
                  className="ps-12"
                  value={scheduledPayment}
                  onChange={(e) => {
                    setPaymentEdited(true);
                    setScheduledPayment(e.target.value);
                  }}
                />
              </div>
              {paymentRederived && (
                <p className="text-xs text-muted-foreground mt-1">
                  {t("rederived")}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="edit-status">{t("status")}</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as LoanStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {tLoans(`status.${s}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DayCountSelect
            id="edit-day-count"
            value={dayCount}
            onChange={setDayCount}
          />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-lender">{t("lender")}</Label>
              <Input
                id="edit-lender"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="edit-contract">{t("contractNumber")}</Label>
              <Input
                id="edit-contract"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-collateral">{t("collateral")}</Label>
            <Input
              id="edit-collateral"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-notes">{t("notes")}</Label>
            <Textarea
              id="edit-notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {tActions("cancel")}
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
              )}
              {tActions("saveChanges")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
