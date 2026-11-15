"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import {
  useLoanWithPayments,
  useLoanScenarios,
  useDeleteLoan,
} from "@/hooks/convex/loans";
import { Id } from "@/convex/_generated/dataModel";
import { loanKpis } from "@/../services/finance/loanScheduleService";
import { todayLocalISO } from "@/lib/utils/date";
import { formatCurrency as formatMoney } from "@/lib/utils/currency";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import {
  Card,
  CardContent,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
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
  ArrowLeft,
  Calendar,
  Percent,
  Clock,
  Building2,
  FileText,
  Edit,
  Trash2,
  CreditCard,
  TrendingDown,
  DollarSign,
  Lightbulb,
  History,
  StickyNote,
  AlertTriangle,
} from "lucide-react";

import { LoanOverviewTab } from "@/components/atomic/organisms/loans/loan-overview-tab";
import { LoanPaymentsScheduleTab } from "@/components/atomic/organisms/loans/loan-payments-schedule-tab";
import { LoanScenariosTab } from "@/components/atomic/organisms/loans/loan-scenarios-tab";
import { LoanNotesTab } from "@/components/atomic/organisms/loans/loan-notes-tab";
import { EditLoanDialog } from "@/components/atomic/organisms/loans/edit-loan-dialog";

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number, currency: string = "USD"): string {
  return formatMoney(value, currency, { fractionDigits: 0 });
}

function formatCurrencyPrecise(
  value: number,
  currency: string = "USD",
): string {
  return formatMoney(value, currency);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
    case "paid_off":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
    case "defaulted":
      return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
    case "refinanced":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300";
    default:
      return "bg-muted text-muted-foreground";
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function LoanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("loans.detail");
  const tLoans = useTranslations("loans");
  const tActions = useTranslations("common.actions");
  const format = useFormatter();
  // Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight
  const formatDate = (date: string) =>
    format.dateTime(new Date(date), "dateOnly");
  const loanId = params.loanId as Id<"loans">;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const loanData = useLoanWithPayments(loanId);
  const scenarios = useLoanScenarios(loanId);
  const { deleteLoan } = useDeleteLoan();

  const loan = loanData?.loan;
  const payments = useMemo(
    () => loanData?.payments ?? [],
    [loanData?.payments],
  );

  const isLoading = loanData === undefined;

  // Every KPI on this page and its tabs comes from the same schedule
  const kpis = useMemo(
    () => (loan ? loanKpis(loan, payments, todayLocalISO()) : null),
    [loan, payments],
  );

  const handleDelete = async () => {
    await deleteLoan(loanId);
    router.push("/liabilities/loans");
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!loan || !kpis) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <Card className="p-12 text-center">
          <h2 className="text-xl font-semibold mb-2">{t("notFoundTitle")}</h2>
          <p className="text-muted-foreground mb-4">
            {t("notFoundDescription")}
          </p>
          <Button onClick={() => router.push("/liabilities/loans")}>
            <ArrowLeft className="h-4 w-4 me-2 rtl:-scale-x-100" />
            {t("back")}
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Back Button & Header */}
      <div className="mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/liabilities/loans")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 me-2 rtl:-scale-x-100" />
          {t("back")}
        </Button>

        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{loan.name}</h1>
              <Badge className={getStatusColor(loan.status)}>
                {tLoans(`status.${loan.status}`)}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              {loan.lender && (
                <span className="flex items-center gap-1">
                  <Building2 className="h-4 w-4" />
                  {loan.lender}
                </span>
              )}
              {loan.contractNumber && (
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {loan.contractNumber}
                </span>
              )}
              <span className="flex items-center gap-1">
                <CreditCard className="h-4 w-4" />
                {tLoans(`loanTypes.${loan.loanType}.label`)}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(true)}>
              <Edit className="h-4 w-4 me-2" />
              {tActions("edit")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 me-2" />
                  {tActions("delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("deleteTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("deleteDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    {tActions("delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t("currentBalance")}
                </p>
                <p className="text-xl font-bold">
                  {formatCurrency(loan.currentBalance, loan.currency)}
                </p>
              </div>
              <DollarSign className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t("interestRate")}
                </p>
                <p className="text-xl font-bold">
                  {formatPercent(loan.annualInterestRate)}
                </p>
              </div>
              <Percent className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t("nextPayment", { frequency: loan.paymentFrequency })}
                </p>
                <p className="text-xl font-bold">
                  {kpis.nextPayment
                    ? formatCurrencyPrecise(
                        kpis.nextPayment.amount,
                        loan.currency,
                      )
                    : "—"}
                </p>
                {kpis.nextPayment && (
                  <p
                    className={`text-xs ${kpis.nextPayment.overdue ? "text-red-600" : "text-muted-foreground"}`}
                  >
                    {t(kpis.nextPayment.overdue ? "overdueSince" : "due", {
                      date: formatDate(kpis.nextPayment.dueDate),
                    })}
                  </p>
                )}
              </div>
              <Calendar className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground mb-1">
                  {t("timeRemaining")}
                </p>
                <p className="text-xl font-bold">
                  {kpis.nextPayment
                    ? tLoans("duration", {
                        years: Math.floor(kpis.remainingMonths / 12),
                        months: kpis.remainingMonths % 12,
                      })
                    : t("paidOff")}
                </p>
                {kpis.projectedPayoffDate && kpis.nextPayment && (
                  <p className="text-xs text-muted-foreground">
                    {t("payoff", { date: formatDate(kpis.projectedPayoffDate) })}
                  </p>
                )}
              </div>
              <Clock className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {(kpis.paymentBelowInterest ||
        kpis.finalBalloon > 0 ||
        kpis.historyInconsistent) && (
        <Card className="mb-6 border-amber-500/50 bg-amber-500/5">
          <CardContent className="pt-4 pb-4 space-y-1 text-sm text-amber-700">
            {kpis.paymentBelowInterest && (
              <p className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("paymentBelowInterest")}
              </p>
            )}
            {!kpis.paymentBelowInterest && kpis.finalBalloon > 0 && (
              <p className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("finalBalloon", {
                  amount: formatCurrencyPrecise(kpis.finalBalloon, loan.currency),
                })}
              </p>
            )}
            {kpis.paymentBelowInterest && kpis.finalBalloon > 0 && (
              <p className="ps-6">
                {t("finalPaymentDue", {
                  amount: formatCurrencyPrecise(kpis.finalBalloon, loan.currency),
                })}
              </p>
            )}
            {kpis.historyInconsistent && (
              <p className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t("historyInconsistent")}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingDown className="h-4 w-4 hidden sm:block" />
            {t("tabs.overview")}
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <History className="h-4 w-4 hidden sm:block" />
            {t("tabs.payments")}
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-2">
            <Lightbulb className="h-4 w-4 hidden sm:block" />
            {t("tabs.scenarios")}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4 hidden sm:block" />
            {t("tabs.notes")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <LoanOverviewTab loan={loan} payments={payments} kpis={kpis} />
        </TabsContent>

        <TabsContent value="payments">
          <LoanPaymentsScheduleTab
            loan={loan}
            payments={payments}
            kpis={kpis}
          />
        </TabsContent>

        <TabsContent value="scenarios">
          <LoanScenariosTab
            loan={loan}
            payments={payments}
            scenarios={scenarios ?? []}
          />
        </TabsContent>

        <TabsContent value="notes">
          <LoanNotesTab loan={loan} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <EditLoanDialog
        loan={loan}
        payments={payments}
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Loading Skeleton
// ═══════════════════════════════════════════════════════════════

function LoadingSkeleton() {
  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <Skeleton className="h-8 w-32 mb-6" />
      <div className="flex justify-between items-start mb-6">
        <div>
          <Skeleton className="h-10 w-64 mb-2" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-12 w-full mb-6" />
      <Skeleton className="h-96 w-full" />
    </div>
  );
}
