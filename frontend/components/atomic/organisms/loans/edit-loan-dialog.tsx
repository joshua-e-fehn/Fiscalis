"use client";

import { useState, useEffect } from "react";
import { Doc } from "@/convex/_generated/dataModel";
import { useUpdateLoan, LoanStatus } from "@/hooks/convex/loans";
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

type Loan = Doc<"loans">;

interface EditLoanDialogProps {
  loan: Loan;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUSES: { value: LoanStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paid_off", label: "Paid Off" },
  { value: "defaulted", label: "Defaulted" },
  { value: "refinanced", label: "Refinanced" },
];

export function EditLoanDialog({
  loan,
  open,
  onOpenChange,
}: EditLoanDialogProps) {
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
  const [nextPaymentDate, setNextPaymentDate] = useState(loan.nextPaymentDate);
  const [status, setStatus] = useState<LoanStatus>(loan.status);
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
    setNextPaymentDate(loan.nextPaymentDate);
    setStatus(loan.status);
    setLender(loan.lender ?? "");
    setContractNumber(loan.contractNumber ?? "");
    setCollateral(loan.collateral ?? "");
    setNotes(loan.notes ?? "");
  }, [loan]);

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
        nextPaymentDate,
        status,
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
          <DialogTitle>Edit Loan</DialogTitle>
          <DialogDescription>
            Update your loan details. Some fields cannot be changed after
            creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="edit-name">Loan Name</Label>
            <Input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-balance">Current Balance</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="edit-balance"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-7"
                  value={currentBalance}
                  onChange={(e) => setCurrentBalance(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-rate">Interest Rate</Label>
              <div className="relative">
                <Input
                  id="edit-rate"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="pr-7"
                  value={annualInterestRate}
                  onChange={(e) => setAnnualInterestRate(e.target.value)}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  %
                </span>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-payment">Scheduled Payment</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  $
                </span>
                <Input
                  id="edit-payment"
                  type="number"
                  step="0.01"
                  min="0"
                  className="pl-7"
                  value={scheduledPayment}
                  onChange={(e) => setScheduledPayment(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v) => setStatus(v as LoanStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="edit-next-payment">Next Payment Date</Label>
            <Input
              id="edit-next-payment"
              type="date"
              value={nextPaymentDate}
              onChange={(e) => setNextPaymentDate(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="edit-lender">Lender</Label>
              <Input
                id="edit-lender"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="edit-contract">Contract Number</Label>
              <Input
                id="edit-contract"
                value={contractNumber}
                onChange={(e) => setContractNumber(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="edit-collateral">Collateral</Label>
            <Input
              id="edit-collateral"
              value={collateral}
              onChange={(e) => setCollateral(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="edit-notes">Notes</Label>
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
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
