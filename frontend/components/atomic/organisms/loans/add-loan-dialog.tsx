"use client";

import { useState, useMemo, useEffect } from "react";
import { useUser } from "@clerk/nextjs";
import {
  useCreateLoan,
  useRecordHistoricalPayments,
  LoanType,
  PaymentFrequency,
} from "@/hooks/convex/loans";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Badge } from "@/components/ui/shadcn/badge";
import { Switch } from "@/components/ui/shadcn/switch";
import { Separator } from "@/components/ui/shadcn/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Check,
  TrendingDown,
  Target,
  Clock,
  AlertTriangle,
  DollarSign,
  Euro,
  PoundSterling,
  JapaneseYen,
  SwissFranc,
  Info,
  Plus,
  Trash2,
  Calendar,
  Percent,
  Building2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AddLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

const CURRENCIES = [
  { value: "USD", label: "US Dollar", symbol: "$", icon: DollarSign },
  { value: "EUR", label: "Euro", symbol: "€", icon: Euro },
  { value: "GBP", label: "British Pound", symbol: "£", icon: PoundSterling },
  { value: "CHF", label: "Swiss Franc", symbol: "Fr", icon: SwissFranc },
  { value: "CAD", label: "Canadian Dollar", symbol: "C$", icon: DollarSign },
  { value: "AUD", label: "Australian Dollar", symbol: "A$", icon: DollarSign },
  { value: "JPY", label: "Japanese Yen", symbol: "¥", icon: JapaneseYen },
];

interface LoanTypeOption {
  value: LoanType;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const LOAN_TYPES: LoanTypeOption[] = [
  {
    value: "ANNUITY",
    label: "Fixed Payment",
    description: "Same payment every period (most common)",
    icon: <TrendingDown className="h-5 w-5" />,
    color: "text-blue-500",
  },
  {
    value: "CONSTANT_PRINCIPAL",
    label: "Declining Payment",
    description: "Payments decrease over time",
    icon: <Target className="h-5 w-5" />,
    color: "text-green-500",
  },
  {
    value: "BULLET",
    label: "Balloon/Bullet",
    description: "Interest only, principal at end",
    icon: <AlertTriangle className="h-5 w-5" />,
    color: "text-red-500",
  },
  {
    value: "INTEREST_ONLY_THEN",
    label: "Interest-Only Period",
    description: "Interest only, then regular payments",
    icon: <Clock className="h-5 w-5" />,
    color: "text-amber-500",
  },
];

interface PaymentFrequencyOption {
  value: PaymentFrequency;
  label: string;
  periodsPerYear: number;
  termLabel: string;
}

const PAYMENT_FREQUENCIES: PaymentFrequencyOption[] = [
  {
    value: "MONTHLY",
    label: "Monthly",
    periodsPerYear: 12,
    termLabel: "months",
  },
  {
    value: "QUARTERLY",
    label: "Quarterly",
    periodsPerYear: 4,
    termLabel: "quarters",
  },
  {
    value: "SEMI_ANNUAL",
    label: "Semi-Annual",
    periodsPerYear: 2,
    termLabel: "half-years",
  },
  { value: "ANNUAL", label: "Annual", periodsPerYear: 1, termLabel: "years" },
];

const STEPS = [
  { id: 1, name: "Basics", description: "Name & type" },
  { id: 2, name: "Terms", description: "Amount & rate" },
  { id: 3, name: "Schedule", description: "Dates & payments" },
  { id: 4, name: "Extras", description: "Extra payments" },
  { id: 5, name: "Review", description: "Confirm details" },
];

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function getCurrencyIcon(currencyCode: string) {
  const currency = CURRENCIES.find((c) => c.value === currencyCode);
  const IconComponent = currency?.icon || DollarSign;
  return <IconComponent className="h-4 w-4 text-muted-foreground" />;
}

function getFrequencyInfo(frequency: PaymentFrequency): PaymentFrequencyOption {
  return (
    PAYMENT_FREQUENCIES.find((f) => f.value === frequency) ||
    PAYMENT_FREQUENCIES[0]
  );
}

function calculatePayment(
  principal: number,
  annualRate: number,
  termPeriods: number,
  periodsPerYear: number,
  loanType: LoanType,
): number {
  if (principal <= 0 || termPeriods <= 0) return 0;

  const periodicRate = annualRate / periodsPerYear;

  if (loanType === "BULLET") {
    return principal * periodicRate;
  }

  if (loanType === "CONSTANT_PRINCIPAL") {
    const principalPayment = principal / termPeriods;
    const interestPayment = principal * periodicRate;
    return principalPayment + interestPayment;
  }

  if (periodicRate === 0) return principal / termPeriods;

  const payment =
    (principal * periodicRate * Math.pow(1 + periodicRate, termPeriods)) /
    (Math.pow(1 + periodicRate, termPeriods) - 1);

  return payment;
}

function addPeriodToDate(date: Date, frequency: PaymentFrequency): Date {
  const newDate = new Date(date);
  const freqInfo = getFrequencyInfo(frequency);
  const monthsToAdd = 12 / freqInfo.periodsPerYear;
  newDate.setMonth(newDate.getMonth() + monthsToAdd);
  return newDate;
}

function calculateMissedPayments(
  startDate: string,
  frequency: PaymentFrequency,
): { count: number; nextDueDate: Date } {
  if (!startDate) return { count: 0, nextDueDate: new Date() };

  const start = new Date(startDate);
  const today = new Date();
  let nextDue = addPeriodToDate(start, frequency);
  let missed = 0;

  while (nextDue <= today) {
    missed++;
    nextDue = addPeriodToDate(nextDue, frequency);
  }

  return { count: missed, nextDueDate: nextDue };
}

function formatCurrency(value: number, currency: string): string {
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

// ═══════════════════════════════════════════════════════════════
// Currency Input Component (outside main component to prevent re-creation)
// ═══════════════════════════════════════════════════════════════

interface CurrencyInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  currency: string;
  placeholder?: string;
  disabled?: boolean;
}

function CurrencyInput({
  id,
  value,
  onChange,
  currency,
  placeholder,
  disabled,
}: CurrencyInputProps) {
  return (
    <div className="relative mt-1.5">
      <span className="absolute left-3 top-1/2 -translate-y-1/2">
        {getCurrencyIcon(currency)}
      </span>
      <Input
        id={id}
        type="number"
        step="0.01"
        min="0"
        placeholder={placeholder}
        className="pl-9"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Extra Payment Interface
// ═══════════════════════════════════════════════════════════════

interface ExtraPayment {
  id: string;
  type: "one_time" | "recurring";
  amount: string;
  date?: string;
  startDate?: string;
}

interface PastPayment {
  id: string;
  dueDate: string;
  amount: string;
  paid: boolean;
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export function AddLoanDialog({ open, onOpenChange }: AddLoanDialogProps) {
  const { user } = useUser();
  const { createLoan } = useCreateLoan();
  const { recordHistoricalPayments } = useRecordHistoricalPayments();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);

  // Step 1: Basic Information
  const [name, setName] = useState("");
  const [loanType, setLoanType] = useState<LoanType>("ANNUITY");
  const [lender, setLender] = useState("");
  const [contractNumber, setContractNumber] = useState("");

  // Step 2: Loan Terms
  const [originalPrincipal, setOriginalPrincipal] = useState("");
  const [currentBalance, setCurrentBalance] = useState("");
  const [annualInterestRate, setAnnualInterestRate] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [termPeriods, setTermPeriods] = useState("");
  const [paymentFrequency, setPaymentFrequency] =
    useState<PaymentFrequency>("MONTHLY");
  const [gracePeriods, setGracePeriods] = useState("");

  // Step 3: Schedule
  const [startDate, setStartDate] = useState("");
  const [scheduledPayment, setScheduledPayment] = useState("");
  const [useCalculatedPayment, setUseCalculatedPayment] = useState(true);
  const [pastPayments, setPastPayments] = useState<PastPayment[]>([]);

  // Step 4: Extra Payments
  const [allowPrepayment, setAllowPrepayment] = useState(true);
  const [maxPrepayment, setMaxPrepayment] = useState("");
  const [prepaymentPenalty, setPrepaymentPenalty] = useState("");
  const [extraPayments, setExtraPayments] = useState<ExtraPayment[]>([]);

  // Step 5: Additional
  const [collateral, setCollateral] = useState("");
  const [notes, setNotes] = useState("");

  // ═══════════════════════════════════════════════════════════════
  // Computed Values
  // ═══════════════════════════════════════════════════════════════

  const frequencyInfo = useMemo(
    () => getFrequencyInfo(paymentFrequency),
    [paymentFrequency],
  );

  const loanTypeInfo = useMemo(
    () => LOAN_TYPES.find((t) => t.value === loanType),
    [loanType],
  );

  const termMonths = useMemo(() => {
    if (!termPeriods) return 0;
    const periods = parseInt(termPeriods);
    return Math.round(periods * (12 / frequencyInfo.periodsPerYear));
  }, [termPeriods, frequencyInfo]);

  const calculatedPayment = useMemo(() => {
    // Always use original principal - the payment was set at loan origination
    // Current balance is just tracking progress, not recalculating payments
    const principal = parseFloat(originalPrincipal) || 0;
    const rate = parseFloat(annualInterestRate) / 100 || 0;
    const periods = parseInt(termPeriods) || 0;

    return calculatePayment(
      principal,
      rate,
      periods,
      frequencyInfo.periodsPerYear,
      loanType,
    );
  }, [
    originalPrincipal,
    annualInterestRate,
    termPeriods,
    frequencyInfo,
    loanType,
  ]);

  const missedPaymentsInfo = useMemo(() => {
    return calculateMissedPayments(startDate, paymentFrequency);
  }, [startDate, paymentFrequency]);

  const effectivePayment = useMemo(() => {
    if (useCalculatedPayment) return calculatedPayment;
    return parseFloat(scheduledPayment) || 0;
  }, [useCalculatedPayment, calculatedPayment, scheduledPayment]);

  const nextPaymentDate = useMemo(() => {
    if (!startDate) return "";
    return missedPaymentsInfo.nextDueDate.toISOString().split("T")[0];
  }, [startDate, missedPaymentsInfo]);

  // Generate past payment slots based on missed payments
  useEffect(() => {
    if (!startDate || missedPaymentsInfo.count === 0) {
      setPastPayments([]);
      return;
    }

    // Calculate due dates for each missed payment
    const payments: PastPayment[] = [];
    const start = new Date(startDate);
    let dueDate = addPeriodToDate(start, paymentFrequency);

    for (let i = 0; i < missedPaymentsInfo.count; i++) {
      payments.push({
        id: `past-${i}`,
        dueDate: dueDate.toISOString().split("T")[0],
        amount: effectivePayment.toFixed(2),
        paid: true, // Default to paid
      });
      dueDate = addPeriodToDate(dueDate, paymentFrequency);
    }

    setPastPayments(payments);
  }, [startDate, missedPaymentsInfo.count, paymentFrequency, effectivePayment]);

  // Check if all past payments are confirmed
  const pastPaymentsConfirmed = useMemo(() => {
    if (missedPaymentsInfo.count === 0) return true;
    return (
      pastPayments.length > 0 &&
      pastPayments.every((p) => p.paid && parseFloat(p.amount) > 0)
    );
  }, [pastPayments, missedPaymentsInfo.count]);

  // ═══════════════════════════════════════════════════════════════
  // Form Management
  // ═══════════════════════════════════════════════════════════════

  const resetForm = () => {
    setCurrentStep(1);
    setName("");
    setLoanType("ANNUITY");
    setLender("");
    setContractNumber("");
    setOriginalPrincipal("");
    setCurrentBalance("");
    setAnnualInterestRate("");
    setCurrency("USD");
    setTermPeriods("");
    setPaymentFrequency("MONTHLY");
    setGracePeriods("");
    setStartDate("");
    setScheduledPayment("");
    setUseCalculatedPayment(true);
    setPastPayments([]);
    setAllowPrepayment(true);
    setMaxPrepayment("");
    setPrepaymentPenalty("");
    setExtraPayments([]);
    setCollateral("");
    setNotes("");
  };

  useEffect(() => {
    if (!open) {
      setTimeout(resetForm, 300);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      const principal = parseFloat(originalPrincipal);
      const balance = currentBalance ? parseFloat(currentBalance) : principal;
      const rate = parseFloat(annualInterestRate) / 100;

      const loanId = await createLoan({
        userId: user.id,
        name,
        loanType,
        originalPrincipal: principal,
        currentBalance: balance,
        annualInterestRate: rate,
        currency,
        termMonths,
        paymentFrequency,
        scheduledPayment: effectivePayment,
        startDate,
        nextPaymentDate,
        lender: lender || undefined,
        contractNumber: contractNumber || undefined,
        collateral: collateral || undefined,
        gracePeriods: gracePeriods ? parseInt(gracePeriods) : undefined,
        maxAnnualPrepaymentRate:
          allowPrepayment && maxPrepayment
            ? parseFloat(maxPrepayment) / 100
            : undefined,
        prepaymentPenaltyRate:
          allowPrepayment && prepaymentPenalty
            ? parseFloat(prepaymentPenalty) / 100
            : undefined,
        notes: notes || undefined,
      });

      // Record past payments if any were marked as paid
      const paidPayments = pastPayments.filter(
        (p) => p.paid && parseFloat(p.amount) > 0,
      );
      if (paidPayments.length > 0) {
        // Calculate principal/interest split for each historical payment
        // For simplicity, use an approximation based on loan type
        const periodicRate = rate / frequencyInfo.periodsPerYear;
        let runningBalance = principal;

        const historicalPayments = paidPayments.map((payment) => {
          const amount = parseFloat(payment.amount);
          const interestPortion = runningBalance * periodicRate;
          const principalPortion = Math.max(0, amount - interestPortion);
          runningBalance = Math.max(0, runningBalance - principalPortion);

          return {
            paymentDate: payment.dueDate, // Assume paid on due date
            scheduledDate: payment.dueDate,
            amount,
            principalPortion: Math.round(principalPortion * 100) / 100,
            interestPortion: Math.round(interestPortion * 100) / 100,
          };
        });

        await recordHistoricalPayments({
          userId: user.id,
          loanId,
          payments: historicalPayments,
        });
      }

      onOpenChange(false);
    } catch (error) {
      console.error("Failed to create loan:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // Step Validation
  // ═══════════════════════════════════════════════════════════════

  const isStep1Valid = name.trim().length > 0;
  const isStep2Valid =
    parseFloat(originalPrincipal) > 0 &&
    parseFloat(annualInterestRate) >= 0 &&
    parseInt(termPeriods) > 0;
  const isStep3Valid =
    startDate && (missedPaymentsInfo.count === 0 || pastPaymentsConfirmed);
  const isStep4Valid = true;
  const isStep5Valid = true;

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return isStep1Valid;
      case 2:
        return isStep2Valid;
      case 3:
        return isStep3Valid;
      case 4:
        return isStep4Valid;
      case 5:
        return isStep5Valid;
      default:
        return false;
    }
  };

  const getNextStep = () => {
    if (currentStep === 3 && !allowPrepayment) return 5;
    return currentStep + 1;
  };

  const getPrevStep = () => {
    if (currentStep === 5 && !allowPrepayment) return 3;
    return currentStep - 1;
  };

  // ═══════════════════════════════════════════════════════════════
  // Extra Payments Management
  // ═══════════════════════════════════════════════════════════════

  const addExtraPayment = (type: "one_time" | "recurring") => {
    setExtraPayments((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        type,
        amount: "",
        date: type === "one_time" ? "" : undefined,
        startDate: type === "recurring" ? "" : undefined,
      },
    ]);
  };

  const removeExtraPayment = (id: string) => {
    setExtraPayments((prev) => prev.filter((ep) => ep.id !== id));
  };

  const updateExtraPayment = (id: string, updates: Partial<ExtraPayment>) => {
    setExtraPayments((prev) =>
      prev.map((ep) => (ep.id === id ? { ...ep, ...updates } : ep)),
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // Step Components
  // ═══════════════════════════════════════════════════════════════

  const StepIndicator = () => {
    // Filter out step 4 if prepayment not allowed
    const visibleSteps = allowPrepayment
      ? STEPS
      : STEPS.filter((s) => s.id !== 4);

    return (
      <div className="flex items-center justify-center mb-6">
        {visibleSteps.map((step, index) => {
          const isActive = step.id === currentStep;
          const isCompleted =
            step.id < currentStep ||
            (step.id === 4 && currentStep === 5 && !allowPrepayment);

          return (
            <div key={step.id} className="flex items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                  isActive && "bg-primary text-primary-foreground",
                  isCompleted && "bg-primary/20 text-primary",
                  !isActive && !isCompleted && "bg-muted text-muted-foreground",
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              {index < visibleSteps.length - 1 && (
                <div
                  className={cn(
                    "w-8 h-0.5 mx-2",
                    step.id < currentStep ? "bg-primary/40" : "bg-muted",
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Loan</DialogTitle>
          <DialogDescription>
            {STEPS.find((s) => s.id === currentStep)?.description}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        <div className="min-h-[350px]">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="name">Loan Name *</Label>
                <Input
                  id="name"
                  placeholder="e.g., Home Mortgage, Car Loan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Give your loan a memorable name
                </p>
              </div>

              <div>
                <Label>Loan Type *</Label>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  {LOAN_TYPES.map((type) => (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => setLoanType(type.value)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-all",
                        loanType === type.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary"
                          : "border-border hover:border-muted-foreground/50",
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className={type.color}>{type.icon}</span>
                        <span className="font-medium text-sm">
                          {type.label}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {type.description}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lender">Lender</Label>
                  <div className="relative mt-1.5">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lender"
                      placeholder="e.g., Wells Fargo"
                      value={lender}
                      onChange={(e) => setLender(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="contractNumber">Contract #</Label>
                  <div className="relative mt-1.5">
                    <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="contractNumber"
                      placeholder="12345-67890"
                      value={contractNumber}
                      onChange={(e) => setContractNumber(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Terms */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="originalPrincipal">Original Amount *</Label>
                  <CurrencyInput
                    id="originalPrincipal"
                    value={originalPrincipal}
                    onChange={setOriginalPrincipal}
                    currency={currency}
                    placeholder="300,000"
                  />
                </div>

                <div>
                  <Label htmlFor="currentBalance">Current Balance</Label>
                  <CurrencyInput
                    id="currentBalance"
                    value={currentBalance}
                    onChange={setCurrentBalance}
                    currency={currency}
                    placeholder="Same as original if new"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="annualInterestRate">
                    Annual Interest Rate *
                  </Label>
                  <div className="relative mt-1.5">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="annualInterestRate"
                      type="number"
                      step="0.01"
                      min="0"
                      max="100"
                      placeholder="3.75"
                      className="pl-9"
                      value={annualInterestRate}
                      onChange={(e) => setAnnualInterestRate(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="currency">Currency</Label>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => {
                        const Icon = c.icon;
                        return (
                          <SelectItem key={c.value} value={c.value}>
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span>{c.value}</span>
                              <span className="text-muted-foreground">
                                - {c.label}
                              </span>
                            </div>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="paymentFrequency">Payment Frequency *</Label>
                  <Select
                    value={paymentFrequency}
                    onValueChange={(v) =>
                      setPaymentFrequency(v as PaymentFrequency)
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_FREQUENCIES.map((freq) => (
                        <SelectItem key={freq.value} value={freq.value}>
                          {freq.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="termPeriods">
                    Term ({frequencyInfo.termLabel}) *
                  </Label>
                  <div className="relative mt-1.5">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="termPeriods"
                      type="number"
                      min="1"
                      placeholder={
                        paymentFrequency === "MONTHLY" ? "360 (30 years)" : "30"
                      }
                      className="pl-9"
                      value={termPeriods}
                      onChange={(e) => setTermPeriods(e.target.value)}
                    />
                  </div>
                  {termPeriods && (
                    <p className="text-xs text-muted-foreground mt-1">
                      = {termMonths} months total
                    </p>
                  )}
                </div>
              </div>

              {loanType === "INTEREST_ONLY_THEN" && (
                <div>
                  <Label htmlFor="gracePeriods">Interest-Only Periods</Label>
                  <Input
                    id="gracePeriods"
                    type="number"
                    min="0"
                    placeholder={`Number of ${frequencyInfo.termLabel}`}
                    className="mt-1.5"
                    value={gracePeriods}
                    onChange={(e) => setGracePeriods(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Step 3: Schedule */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="startDate">Loan Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  className="mt-1.5"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              {startDate && calculatedPayment > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Info className="h-4 w-4 text-blue-500" />
                      Calculated Payment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold">
                          {formatCurrency(calculatedPayment, currency)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          per{" "}
                          {frequencyInfo.label.toLowerCase().replace("ly", "")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={useCalculatedPayment}
                          onCheckedChange={setUseCalculatedPayment}
                        />
                        <Label className="text-sm">Use this amount</Label>
                      </div>
                    </div>

                    {!useCalculatedPayment && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <Label htmlFor="customPayment">
                            Custom Payment Amount
                          </Label>
                          <CurrencyInput
                            id="customPayment"
                            value={scheduledPayment}
                            onChange={setScheduledPayment}
                            currency={currency}
                            placeholder="Enter your actual payment"
                          />
                        </div>

                        {scheduledPayment &&
                          parseFloat(scheduledPayment) !==
                            calculatedPayment && (
                            <div className="p-3 rounded-lg bg-muted/50 text-sm">
                              {parseFloat(scheduledPayment) >
                              calculatedPayment ? (
                                <p className="text-green-600">
                                  <strong>Higher payment:</strong> Your loan
                                  will be paid off faster than the original
                                  term.
                                </p>
                              ) : parseFloat(scheduledPayment) <
                                calculatedPayment * 0.5 ? (
                                <p className="text-red-600">
                                  <strong>Warning:</strong> This payment may not
                                  cover the interest. Your balance could
                                  increase over time (negative amortization).
                                </p>
                              ) : (
                                <p className="text-amber-600">
                                  <strong>Lower payment:</strong> Your loan will
                                  take longer to pay off, or you'll have a
                                  balloon payment at the end.
                                </p>
                              )}
                            </div>
                          )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {startDate && missedPaymentsInfo.count > 0 && (
                <Card className="border-amber-500/50 bg-amber-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-amber-600">
                      <AlertTriangle className="h-4 w-4" />
                      Past Payments ({missedPaymentsInfo.count})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      Based on your start date, {missedPaymentsInfo.count}{" "}
                      payment
                      {missedPaymentsInfo.count > 1 ? "s have" : " has"} already
                      come due. Record the payments you've made:
                    </p>

                    <div className="space-y-3">
                      {pastPayments.map((payment, index) => (
                        <div
                          key={payment.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-background border"
                        >
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={payment.paid}
                              onCheckedChange={(checked) => {
                                setPastPayments((prev) =>
                                  prev.map((p) =>
                                    p.id === payment.id
                                      ? { ...p, paid: checked }
                                      : p,
                                  ),
                                );
                              }}
                            />
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium">
                              Payment {index + 1} - Due{" "}
                              {formatDate(payment.dueDate)}
                            </p>
                          </div>
                          <div className="w-32">
                            <Input
                              type="number"
                              step="0.01"
                              value={payment.amount}
                              onChange={(e) => {
                                setPastPayments((prev) =>
                                  prev.map((p) =>
                                    p.id === payment.id
                                      ? { ...p, amount: e.target.value }
                                      : p,
                                  ),
                                );
                              }}
                              disabled={!payment.paid}
                              className="text-right"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    <p className="text-xs text-muted-foreground mt-3">
                      <strong>Next payment due:</strong>{" "}
                      {formatDate(nextPaymentDate)}
                    </p>
                  </CardContent>
                </Card>
              )}

              {startDate && missedPaymentsInfo.count === 0 && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm">
                    <strong>First payment due:</strong>{" "}
                    {formatDate(nextPaymentDate)}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Extras */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Allow Extra Payments</Label>
                  <p className="text-sm text-muted-foreground">
                    Can you make prepayments on this loan?
                  </p>
                </div>
                <Switch
                  checked={allowPrepayment}
                  onCheckedChange={setAllowPrepayment}
                />
              </div>

              {allowPrepayment && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="maxPrepayment">
                        Max Annual Prepayment
                      </Label>
                      <div className="relative mt-1.5">
                        <Input
                          id="maxPrepayment"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          placeholder="No limit"
                          className="pr-7"
                          value={maxPrepayment}
                          onChange={(e) => setMaxPrepayment(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        % of original principal per year
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="prepaymentPenalty">
                        Prepayment Penalty
                      </Label>
                      <div className="relative mt-1.5">
                        <Input
                          id="prepaymentPenalty"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          placeholder="None"
                          className="pr-7"
                          value={prepaymentPenalty}
                          onChange={(e) => setPrepaymentPenalty(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Penalty fee on extra payments
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-base">
                        Planned Extra Payments
                      </Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addExtraPayment("one_time")}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          One-time
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addExtraPayment("recurring")}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          Recurring
                        </Button>
                      </div>
                    </div>

                    {extraPayments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No extra payments planned. You can add them later too.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {extraPayments.map((ep) => (
                          <Card key={ep.id}>
                            <CardContent className="p-3">
                              <div className="flex items-center gap-3">
                                <Badge
                                  variant={
                                    ep.type === "one_time"
                                      ? "secondary"
                                      : "default"
                                  }
                                >
                                  {ep.type === "one_time"
                                    ? "One-time"
                                    : "Recurring"}
                                </Badge>
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <CurrencyInput
                                    id={`extra-${ep.id}-amount`}
                                    value={ep.amount}
                                    onChange={(v) =>
                                      updateExtraPayment(ep.id, { amount: v })
                                    }
                                    currency={currency}
                                    placeholder="Amount"
                                  />
                                  <Input
                                    type="date"
                                    className="mt-1.5"
                                    value={
                                      ep.type === "one_time"
                                        ? ep.date
                                        : ep.startDate
                                    }
                                    onChange={(e) =>
                                      updateExtraPayment(ep.id, {
                                        [ep.type === "one_time"
                                          ? "date"
                                          : "startDate"]: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeExtraPayment(ep.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                              {ep.type === "recurring" && (
                                <p className="text-xs text-muted-foreground mt-2 ml-20">
                                  Added to each{" "}
                                  {frequencyInfo.label
                                    .toLowerCase()
                                    .replace("ly", "")}{" "}
                                  payment
                                </p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 5: Review */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Loan Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">{name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Type</span>
                    <div className="flex items-center gap-2">
                      <span className={loanTypeInfo?.color}>
                        {loanTypeInfo?.icon}
                      </span>
                      <span className="font-medium">{loanTypeInfo?.label}</span>
                    </div>
                  </div>
                  {lender && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Lender</span>
                      <span className="font-medium">{lender}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Original Amount
                    </span>
                    <span className="font-medium">
                      {formatCurrency(
                        parseFloat(originalPrincipal) || 0,
                        currency,
                      )}
                    </span>
                  </div>
                  {currentBalance && currentBalance !== originalPrincipal && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Current Balance
                      </span>
                      <span className="font-medium">
                        {formatCurrency(parseFloat(currentBalance), currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest Rate</span>
                    <span className="font-medium">
                      {annualInterestRate}% p.a.
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Term</span>
                    <span className="font-medium">
                      {termPeriods} {frequencyInfo.termLabel} ({termMonths}{" "}
                      months)
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Payment</span>
                    <span className="font-medium">
                      {formatCurrency(effectivePayment, currency)} /{" "}
                      {frequencyInfo.label.toLowerCase().replace("ly", "")}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Start Date</span>
                    <span className="font-medium">{formatDate(startDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Next Payment</span>
                    <span className="font-medium">
                      {formatDate(nextPaymentDate)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Prepayment</span>
                    <Badge variant={allowPrepayment ? "default" : "secondary"}>
                      {allowPrepayment ? "Allowed" : "Not Allowed"}
                    </Badge>
                  </div>
                  {extraPayments.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Planned Extra Payments
                      </span>
                      <span className="font-medium">
                        {extraPayments.length}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Contract details, special terms, contact info..."
                  rows={3}
                  className="mt-1.5"
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNotes(e.target.value)
                  }
                />
              </div>

              <div>
                <Label htmlFor="collateral">Collateral</Label>
                <Input
                  id="collateral"
                  placeholder="e.g., Primary Residence"
                  className="mt-1.5"
                  value={collateral}
                  onChange={(e) => setCollateral(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (currentStep === 1) {
                onOpenChange(false);
              } else {
                setCurrentStep(getPrevStep());
              }
            }}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            {currentStep === 1 ? "Cancel" : "Back"}
          </Button>

          {currentStep < 5 ? (
            <Button
              type="button"
              onClick={() => setCurrentStep(getNextStep())}
              disabled={!canProceed()}
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Add Loan
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
