"use client";

import { useState, useMemo, useEffect, useEffectEvent } from "react";
import { useUser } from "@clerk/nextjs";
import { useFormatter, useTranslations } from "next-intl";
import {
  useCreateLoan,
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
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import { currencyCodes, formatCurrency } from "@/lib/utils/currency";
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
import { todayLocalISO } from "@/lib/utils/date";
import {
  calculateLoanSchedule,
  getDueDate,
  getPaymentsPerYear,
  initialScheduledPayment,
  type DayCountConvention,
} from "@/../services/finance/loanScheduleService";
import { roundMoney } from "@/../services/finance/financeService";
import { DayCountSelect } from "@/components/atomic/molecules/loans/day-count-select";

interface AddLoanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

// Names are under loans.currencies.<value>
const CURRENCIES = [
  { value: "USD", symbol: "$", icon: DollarSign },
  { value: "EUR", symbol: "€", icon: Euro },
  { value: "GBP", symbol: "£", icon: PoundSterling },
  { value: "CHF", symbol: "Fr", icon: SwissFranc },
  { value: "CAD", symbol: "C$", icon: DollarSign },
  { value: "AUD", symbol: "A$", icon: DollarSign },
  { value: "JPY", symbol: "¥", icon: JapaneseYen },
] as const;

interface LoanTypeOption {
  value: LoanType;
  icon: React.ReactNode;
  color: string;
}

// Labels and descriptions are under loans.loanTypes.<value>
const LOAN_TYPES: LoanTypeOption[] = [
  {
    value: "ANNUITY",
    icon: <TrendingDown className="h-5 w-5" />,
    color: "text-blue-500",
  },
  {
    value: "CONSTANT_PRINCIPAL",
    icon: <Target className="h-5 w-5" />,
    color: "text-green-500",
  },
  {
    value: "BULLET",
    icon: <AlertTriangle className="h-5 w-5" />,
    color: "text-red-500",
  },
  {
    value: "INTEREST_ONLY_THEN",
    icon: <Clock className="h-5 w-5" />,
    color: "text-amber-500",
  },
];

interface PaymentFrequencyOption {
  value: PaymentFrequency;
  periodsPerYear: number;
}

// Labels are under loans.frequency.<value>
const PAYMENT_FREQUENCIES: PaymentFrequencyOption[] = [
  { value: "MONTHLY", periodsPerYear: 12 },
  { value: "QUARTERLY", periodsPerYear: 4 },
  { value: "SEMI_ANNUAL", periodsPerYear: 2 },
  { value: "ANNUAL", periodsPerYear: 1 },
];

// Descriptions are under loans.add.steps.<key>
const STEPS = [
  { id: 1, key: "basics" },
  { id: 2, key: "terms" },
  { id: 3, key: "schedule" },
  { id: 4, key: "extras" },
  { id: 5, key: "review" },
] as const;

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

// Due dates up to and including today, and the first one after it
function calculateMissedPayments(
  startDate: string,
  frequency: PaymentFrequency,
): { count: number; nextDueDate: string } {
  const today = todayLocalISO();
  if (!startDate) return { count: 0, nextDueDate: today };

  const loan = { startDate, paymentFrequency: frequency };
  let missed = 0;
  while (getDueDate(loan, missed + 1) <= today) {
    missed++;
  }

  return { count: missed, nextDueDate: getDueDate(loan, missed + 1) };
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
  /** Recurring: first due date it applies to (blank = from the first). */
  startDate?: string;
  /** Recurring: last due date it applies to (blank = to the end). */
  endDate?: string;
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
  const t = useTranslations("loans.add");
  const tLoans = useTranslations("loans");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  // Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight
  const formatDate = (date: string) =>
    format.dateTime(new Date(date), "dateOnly");
  const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;
  const { user } = useUser();
  const { createLoan } = useCreateLoan();
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
  // New loans default to the user's display currency. The dialog stays
  // mounted, so the default follows it until the user picks one (it is
  // EUR while the display currency loads)
  const defaultCurrency = currencyCodes[useDisplayCurrency().currency];
  const [chosenCurrency, setCurrency] = useState<string | null>(null);
  const currency = chosenCurrency ?? defaultCurrency;
  const [termPeriods, setTermPeriods] = useState("");
  const [paymentFrequency, setPaymentFrequency] =
    useState<PaymentFrequency>("MONTHLY");
  const [gracePeriods, setGracePeriods] = useState("");
  const [dayCount, setDayCount] = useState<DayCountConvention | undefined>();

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

  const periodUnit = tLoans(`periodUnit.${paymentFrequency}`);

  const loanTypeInfo = useMemo(
    () => LOAN_TYPES.find((t) => t.value === loanType),
    [loanType],
  );

  const termMonths = useMemo(() => {
    if (!termPeriods) return 0;
    const periods = parseInt(termPeriods);
    return Math.round(periods * (12 / frequencyInfo.periodsPerYear));
  }, [termPeriods, frequencyInfo]);

  const loanTerms = useMemo(
    () => ({
      loanType,
      // The payment is set at origination from the original principal;
      // the current balance only tracks progress
      originalPrincipal: parseFloat(originalPrincipal) || 0,
      annualInterestRate: parseFloat(annualInterestRate) / 100 || 0,
      termMonths,
      paymentFrequency,
      gracePeriods: gracePeriods ? parseInt(gracePeriods) : undefined,
    }),
    [
      loanType,
      originalPrincipal,
      annualInterestRate,
      termMonths,
      paymentFrequency,
      gracePeriods,
    ],
  );

  // Same rule as createLoan: for INTEREST_ONLY_THEN the post-grace payment
  const calculatedPayment = useMemo(
    () => (termMonths > 0 ? initialScheduledPayment(loanTerms) : 0),
    [loanTerms, termMonths],
  );

  // INTEREST_ONLY_THEN: what is paid during the grace periods
  const interestOnlyPayment = roundMoney(
    (loanTerms.originalPrincipal * loanTerms.annualInterestRate) /
      getPaymentsPerYear(paymentFrequency),
  );

  const missedPaymentsInfo = useMemo(() => {
    return calculateMissedPayments(startDate, paymentFrequency);
  }, [startDate, paymentFrequency]);

  const effectivePayment = useMemo(() => {
    if (useCalculatedPayment) return calculatedPayment;
    return parseFloat(scheduledPayment) || 0;
  }, [useCalculatedPayment, calculatedPayment, scheduledPayment]);

  const nextPaymentDate = useMemo(() => {
    if (!startDate) return "";
    return missedPaymentsInfo.nextDueDate;
  }, [startDate, missedPaymentsInfo]);

  // Pre-fill each past due date with the amount the schedule expected then
  // (interest only during grace, declining for CONSTANT_PRINCIPAL, …)
  useEffect(() => {
    if (!startDate || missedPaymentsInfo.count === 0) {
      setPastPayments([]);
      return;
    }

    const { schedule } = calculateLoanSchedule({
      loanType,
      principal: loanTerms.originalPrincipal,
      annualInterestRate: loanTerms.annualInterestRate,
      termPeriods: Math.round((termMonths * frequencyInfo.periodsPerYear) / 12),
      paymentFrequency,
      startDate,
      gracePeriods: loanTerms.gracePeriods,
      fixedPayment: effectivePayment || undefined,
    });

    const payments: PastPayment[] = [];
    for (let i = 0; i < missedPaymentsInfo.count; i++) {
      payments.push({
        id: `past-${i}`,
        dueDate: getDueDate({ startDate, paymentFrequency }, i + 1),
        amount: (schedule[i]?.scheduledPayment ?? 0).toFixed(2),
        paid: true, // Default to paid
      });
    }

    setPastPayments(payments);
  }, [
    startDate,
    missedPaymentsInfo.count,
    paymentFrequency,
    effectivePayment,
    loanType,
    loanTerms,
    termMonths,
    frequencyInfo,
  ]);

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
    setCurrency(null);
    setTermPeriods("");
    setPaymentFrequency("MONTHLY");
    setGracePeriods("");
    setDayCount(undefined);
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

  // Reads the latest resetForm without re-running the effect when it changes,
  // so the delayed reset still fires only when `open` flips.
  const scheduleReset = useEffectEvent(() => {
    setTimeout(resetForm, 300);
  });

  useEffect(() => {
    if (!open) {
      scheduleReset();
    }
  }, [open]);

  // Planned extra payments, saved as the loan's "Planned extra payments"
  // scenario: every recurring extra, each with its own from/until due dates
  const plannedPrepayments = () => {
    if (!allowPrepayment) return undefined;
    const valid = extraPayments.filter((ep) => parseFloat(ep.amount) > 0);
    return {
      recurringExtras: valid
        .filter((ep) => ep.type === "recurring")
        .map((ep) => ({
          amount: parseFloat(ep.amount),
          from: ep.startDate || undefined,
          until: ep.endDate || undefined,
        })),
      oneTimePrepayments: valid
        .filter((ep) => ep.type === "one_time" && ep.date)
        .map((ep) => ({ date: ep.date!, amount: parseFloat(ep.amount) })),
    };
  };

  const handleSubmit = async () => {
    if (!user?.id) return;

    setIsSubmitting(true);
    try {
      // The server splits each confirmed past payment (assumed paid on its
      // due date) and, with a blank "Current Balance", derives the balance
      // left after them
      await createLoan({
        name,
        loanType,
        originalPrincipal: parseFloat(originalPrincipal),
        currentBalance: currentBalance ? parseFloat(currentBalance) : undefined,
        annualInterestRate: parseFloat(annualInterestRate) / 100,
        currency,
        termMonths,
        paymentFrequency,
        scheduledPayment: effectivePayment,
        startDate,
        lender: lender || undefined,
        contractNumber: contractNumber || undefined,
        collateral: collateral || undefined,
        gracePeriods: gracePeriods ? parseInt(gracePeriods) : undefined,
        dayCount,
        maxAnnualPrepaymentRate:
          allowPrepayment && maxPrepayment
            ? parseFloat(maxPrepayment) / 100
            : undefined,
        prepaymentPenaltyRate:
          allowPrepayment && prepaymentPenalty
            ? parseFloat(prepaymentPenalty) / 100
            : undefined,
        notes: notes || undefined,
        historicalPayments: pastPayments
          .filter((p) => p.paid && parseFloat(p.amount) > 0)
          .map((p) => ({
            paymentDate: p.dueDate,
            amount: parseFloat(p.amount),
          })),
        plannedPrepayments: plannedPrepayments(),
      });

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
    parseInt(termPeriods) > 0 &&
    // INTEREST_ONLY_THEN needs its interest-only periods, within the term
    (loanType !== "INTEREST_ONLY_THEN" ||
      (parseInt(gracePeriods) >= 1 &&
        parseInt(gracePeriods) < parseInt(termPeriods)));
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
        endDate: type === "recurring" ? "" : undefined,
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
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t(`steps.${STEPS[currentStep - 1].key}`)}
          </DialogDescription>
        </DialogHeader>

        <StepIndicator />

        <div className="min-h-[350px]">
          {/* Step 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <Label htmlFor="name">{t("name")}</Label>
                <Input
                  id="name"
                  placeholder={t("namePlaceholder")}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  {t("nameHint")}
                </p>
              </div>

              <div>
                <Label>{t("loanType")}</Label>
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
                          {tLoans(`loanTypes.${type.value}.label`)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tLoans(`loanTypes.${type.value}.description`)}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="lender">{t("lender")}</Label>
                  <div className="relative mt-1.5">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="lender"
                      placeholder={t("lenderPlaceholder")}
                      value={lender}
                      onChange={(e) => setLender(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="contractNumber">{t("contractNumber")}</Label>
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
                  <Label htmlFor="originalPrincipal">
                    {t("originalAmount")}
                  </Label>
                  <CurrencyInput
                    id="originalPrincipal"
                    value={originalPrincipal}
                    onChange={setOriginalPrincipal}
                    currency={currency}
                    placeholder={t("originalAmountPlaceholder")}
                  />
                </div>

                <div>
                  <Label htmlFor="currentBalance">{t("currentBalance")}</Label>
                  <CurrencyInput
                    id="currentBalance"
                    value={currentBalance}
                    onChange={setCurrentBalance}
                    currency={currency}
                    placeholder={t("currentBalancePlaceholder")}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="annualInterestRate">{t("annualRate")}</Label>
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
                  <Label htmlFor="currency">{t("currency")}</Label>
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
                                - {tLoans(`currencies.${c.value}`)}
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
                  <Label htmlFor="paymentFrequency">
                    {t("paymentFrequency")}
                  </Label>
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
                          {tLoans(`frequency.${freq.value}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="termPeriods">
                    {t("term", { unit: periodUnit })}
                  </Label>
                  <div className="relative mt-1.5">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="termPeriods"
                      type="number"
                      min="1"
                      placeholder={
                        paymentFrequency === "MONTHLY"
                          ? t("termPlaceholderMonthly")
                          : "30"
                      }
                      className="pl-9"
                      value={termPeriods}
                      onChange={(e) => setTermPeriods(e.target.value)}
                    />
                  </div>
                  {termPeriods && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {t("termMonthsTotal", { months: termMonths })}
                    </p>
                  )}
                </div>
              </div>

              <DayCountSelect
                id="dayCount"
                value={dayCount}
                onChange={setDayCount}
              />

              {loanType === "INTEREST_ONLY_THEN" && (
                <div>
                  <Label htmlFor="gracePeriods">{t("gracePeriods")}</Label>
                  <Input
                    id="gracePeriods"
                    type="number"
                    min="0"
                    placeholder={t("gracePeriodsPlaceholder", {
                      unit: periodUnit,
                    })}
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
                <Label htmlFor="startDate">{t("startDate")}</Label>
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
                      {t("calculatedPayment")}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-2xl font-bold">
                          {formatCurrency(calculatedPayment, currency)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {tLoans("perPeriod", { frequency: paymentFrequency })}
                        </p>
                        {loanType === "INTEREST_ONLY_THEN" && (
                          <p className="text-xs text-muted-foreground">
                            {t("afterInterestOnly", {
                              amount: formatCurrency(
                                interestOnlyPayment,
                                currency,
                              ),
                              frequency: paymentFrequency,
                              count: parseInt(gracePeriods) || 0,
                            })}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={useCalculatedPayment}
                          onCheckedChange={setUseCalculatedPayment}
                        />
                        <Label className="text-sm">{t("useThisAmount")}</Label>
                      </div>
                    </div>

                    {!useCalculatedPayment && (
                      <div className="mt-4 space-y-3">
                        <div>
                          <Label htmlFor="customPayment">
                            {t("customPayment")}
                          </Label>
                          <CurrencyInput
                            id="customPayment"
                            value={scheduledPayment}
                            onChange={setScheduledPayment}
                            currency={currency}
                            placeholder={t("customPaymentPlaceholder")}
                          />
                        </div>

                        {scheduledPayment &&
                          parseFloat(scheduledPayment) !==
                            calculatedPayment && (
                            <div className="p-3 rounded-lg bg-muted/50 text-sm">
                              {parseFloat(scheduledPayment) >
                              calculatedPayment ? (
                                <p className="text-green-600">
                                  {t.rich("higherPayment", { strong })}
                                </p>
                              ) : parseFloat(scheduledPayment) <
                                calculatedPayment * 0.5 ? (
                                <p className="text-red-600">
                                  {t.rich("paymentTooLow", { strong })}
                                </p>
                              ) : (
                                <p className="text-amber-600">
                                  {t.rich("lowerPayment", { strong })}
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
                      {t("pastPaymentsTitle", {
                        count: missedPaymentsInfo.count,
                      })}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t("pastPaymentsDescription", {
                        count: missedPaymentsInfo.count,
                      })}
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
                              {t("pastPayment", {
                                number: index + 1,
                                date: formatDate(payment.dueDate),
                              })}
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
                      {t.rich("nextPaymentDue", {
                        strong,
                        date: formatDate(nextPaymentDate),
                      })}
                    </p>
                  </CardContent>
                </Card>
              )}

              {startDate && missedPaymentsInfo.count === 0 && (
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-sm">
                    {t.rich("firstPaymentDue", {
                      strong,
                      date: formatDate(nextPaymentDate),
                    })}
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
                  <Label className="text-base">{t("allowExtra")}</Label>
                  <p className="text-sm text-muted-foreground">
                    {t("allowExtraHint")}
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
                        {t("maxPrepayment")}
                      </Label>
                      <div className="relative mt-1.5">
                        <Input
                          id="maxPrepayment"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          placeholder={t("noLimit")}
                          className="pr-7"
                          value={maxPrepayment}
                          onChange={(e) => setMaxPrepayment(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("maxPrepaymentHint")}
                      </p>
                    </div>

                    <div>
                      <Label htmlFor="prepaymentPenalty">{t("penalty")}</Label>
                      <div className="relative mt-1.5">
                        <Input
                          id="prepaymentPenalty"
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          placeholder={t("none")}
                          className="pr-7"
                          value={prepaymentPenalty}
                          onChange={(e) => setPrepaymentPenalty(e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          %
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("penaltyHint")}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <Label className="text-base">{t("plannedExtras")}</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addExtraPayment("one_time")}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t("oneTime")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addExtraPayment("recurring")}
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {t("recurring")}
                        </Button>
                      </div>
                    </div>

                    {extraPayments.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t("noExtras")}
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
                                    ? t("oneTime")
                                    : t("recurring")}
                                </Badge>
                                <div className="flex-1 grid grid-cols-2 gap-2">
                                  <CurrencyInput
                                    id={`extra-${ep.id}-amount`}
                                    value={ep.amount}
                                    onChange={(v) =>
                                      updateExtraPayment(ep.id, { amount: v })
                                    }
                                    currency={currency}
                                    placeholder={t("amount")}
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
                                <div className="flex flex-wrap items-center gap-2 mt-2 ml-20">
                                  <Label
                                    htmlFor={`extra-${ep.id}-until`}
                                    className="text-xs text-muted-foreground"
                                  >
                                    {t("until")}
                                  </Label>
                                  <Input
                                    id={`extra-${ep.id}-until`}
                                    type="date"
                                    className="w-auto h-8"
                                    value={ep.endDate}
                                    onChange={(e) =>
                                      updateExtraPayment(ep.id, {
                                        endDate: e.target.value,
                                      })
                                    }
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    {t("recurringHint", {
                                      eachPayment: tLoans("eachPayment", {
                                        frequency: paymentFrequency,
                                      }),
                                    })}
                                  </p>
                                </div>
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
                  <CardTitle className="text-base">{t("summary")}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("reviewName")}
                    </span>
                    <span className="font-medium">{name}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">
                      {t("reviewType")}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className={loanTypeInfo?.color}>
                        {loanTypeInfo?.icon}
                      </span>
                      <span className="font-medium">
                        {tLoans(`loanTypes.${loanType}.label`)}
                      </span>
                    </div>
                  </div>
                  {lender && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("lender")}
                      </span>
                      <span className="font-medium">{lender}</span>
                    </div>
                  )}
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("originalAmountReview")}
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
                        {t("currentBalance")}
                      </span>
                      <span className="font-medium">
                        {formatCurrency(parseFloat(currentBalance), currency)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("interestRate")}
                    </span>
                    <span className="font-medium">
                      {t("ratePerYear", { rate: annualInterestRate })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("termReview")}
                    </span>
                    <span className="font-medium">
                      {t("termValue", {
                        periods: tLoans("periodCount", {
                          frequency: paymentFrequency,
                          count: parseInt(termPeriods) || 0,
                        }),
                        months: tLoans("months", { count: termMonths }),
                      })}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("payment")}
                    </span>
                    <span className="font-medium">
                      {tLoans("amountPerPeriod", {
                        amount: formatCurrency(effectivePayment, currency),
                        frequency: paymentFrequency,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("startDateReview")}
                    </span>
                    <span className="font-medium">{formatDate(startDate)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("nextPayment")}
                    </span>
                    <span className="font-medium">
                      {formatDate(nextPaymentDate)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      {t("prepayment")}
                    </span>
                    <Badge variant={allowPrepayment ? "default" : "secondary"}>
                      {allowPrepayment ? t("allowed") : t("notAllowed")}
                    </Badge>
                  </div>
                  {extraPayments.length > 0 && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        {t("plannedExtras")}
                      </span>
                      <span className="font-medium">
                        {extraPayments.length}
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div>
                <Label htmlFor="notes">{t("notes")}</Label>
                <Textarea
                  id="notes"
                  placeholder={t("notesPlaceholder")}
                  rows={3}
                  className="mt-1.5"
                  value={notes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setNotes(e.target.value)
                  }
                />
              </div>

              <div>
                <Label htmlFor="collateral">{t("collateral")}</Label>
                <Input
                  id="collateral"
                  placeholder={t("collateralPlaceholder")}
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
            {currentStep === 1 ? tActions("cancel") : tActions("back")}
          </Button>

          {currentStep < 5 ? (
            <Button
              type="button"
              onClick={() => setCurrentStep(getNextStep())}
              disabled={!canProceed()}
            >
              {t("next")}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {t("submit")}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
