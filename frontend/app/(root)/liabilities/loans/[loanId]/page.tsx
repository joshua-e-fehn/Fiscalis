"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  useLoanWithPayments,
  useLoanScenarios,
  useUpdateLoan,
  useDeleteLoan,
} from "@/hooks/convex/loans";
import { Id } from "@/convex/_generated/dataModel";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
  Target,
  Lightbulb,
  History,
  StickyNote,
} from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartConfig,
} from "@/components/ui/shadcn/chart";
import {
  Area,
  AreaChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Bar,
  BarChart,
} from "recharts";

import { LoanOverviewTab } from "@/components/atomic/organisms/loans/loan-overview-tab";
import { LoanPaymentsScheduleTab } from "@/components/atomic/organisms/loans/loan-payments-schedule-tab";
import { LoanScenariosTab } from "@/components/atomic/organisms/loans/loan-scenarios-tab";
import { LoanNotesTab } from "@/components/atomic/organisms/loans/loan-notes-tab";
import { EditLoanDialog } from "@/components/atomic/organisms/loans/edit-loan-dialog";

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function formatCurrencyPrecise(
  value: number,
  currency: string = "USD",
): string {
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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function getLoanTypeLabel(type: string): string {
  switch (type) {
    case "ANNUITY":
      return "Fixed Payment";
    case "CONSTANT_PRINCIPAL":
      return "Declining Payment";
    case "BULLET":
      return "Balloon/Bullet";
    case "INTEREST_ONLY_THEN":
      return "Interest-Only";
    default:
      return type;
  }
}

function getPaymentFrequencyLabel(frequency: string): string {
  switch (frequency) {
    case "MONTHLY":
      return "Monthly";
    case "QUARTERLY":
      return "Quarterly";
    case "SEMI_ANNUAL":
      return "Semi-Annual";
    case "ANNUAL":
      return "Annual";
    default:
      return frequency;
  }
}

function getStatusColor(status: string): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700";
    case "paid_off":
      return "bg-blue-100 text-blue-700";
    case "defaulted":
      return "bg-red-100 text-red-700";
    case "refinanced":
      return "bg-purple-100 text-purple-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function LoanDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useUser();
  const loanId = params.loanId as Id<"loans">;

  const [showEditDialog, setShowEditDialog] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");

  const loanData = useLoanWithPayments(loanId);
  const scenarios = useLoanScenarios(loanId);
  const { deleteLoan } = useDeleteLoan();

  const loan = loanData?.loan;
  const payments = loanData?.payments ?? [];

  const isLoading = loanData === undefined;

  // Calculate progress
  const progress = useMemo(() => {
    if (!loan) return 0;
    return (
      ((loan.originalPrincipal - loan.currentBalance) /
        loan.originalPrincipal) *
      100
    );
  }, [loan]);

  // Calculate total paid
  const totalPaid = useMemo(() => {
    if (!loan) return 0;
    return loan.originalPrincipal - loan.currentBalance;
  }, [loan]);

  // Calculate total interest paid
  const totalInterestPaid = useMemo(() => {
    return payments.reduce((sum, p) => sum + p.interestPortion, 0);
  }, [payments]);

  // Calculate remaining term in months
  const remainingTermMonths = useMemo(() => {
    if (!loan || loan.status === "paid_off") return 0;
    const today = new Date();
    const endDate = new Date(loan.expectedEndDate);
    const months =
      (endDate.getFullYear() - today.getFullYear()) * 12 +
      (endDate.getMonth() - today.getMonth());
    return Math.max(0, months);
  }, [loan]);

  const handleDelete = async () => {
    await deleteLoan(loanId);
    router.push("/debt/loans");
  };

  if (isLoading) {
    return <LoadingSkeleton />;
  }

  if (!loan) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <Card className="p-12 text-center">
          <h2 className="text-xl font-semibold mb-2">Loan not found</h2>
          <p className="text-muted-foreground mb-4">
            The loan you&apos;re looking for doesn&apos;t exist or has been
            deleted.
          </p>
          <Button onClick={() => router.push("/debt/loans")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Loans
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
          onClick={() => router.push("/debt/loans")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Loans
        </Button>

        <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-bold">{loan.name}</h1>
              <Badge className={getStatusColor(loan.status)}>
                {loan.status.replace("_", " ")}
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
                {getLoanTypeLabel(loan.loanType)}
              </span>
            </div>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowEditDialog(true)}>
              <Edit className="h-4 w-4 mr-2" />
              Edit
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Loan</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete this loan? This will also
                    delete all payment history and scenarios. This action cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDelete}
                    className="bg-red-600 hover:bg-red-700"
                  >
                    Delete
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
                  Current Balance
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
                  Interest Rate
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
                  {getPaymentFrequencyLabel(loan.paymentFrequency)} Payment
                </p>
                <p className="text-xl font-bold">
                  {formatCurrencyPrecise(loan.scheduledPayment, loan.currency)}
                </p>
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
                  Time Remaining
                </p>
                <p className="text-xl font-bold">
                  {remainingTermMonths > 0
                    ? `${Math.floor(remainingTermMonths / 12)}y ${remainingTermMonths % 12}m`
                    : "Paid off"}
                </p>
              </div>
              <Clock className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-6"
      >
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="overview" className="gap-2">
            <TrendingDown className="h-4 w-4 hidden sm:block" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <History className="h-4 w-4 hidden sm:block" />
            Payments & Schedule
          </TabsTrigger>
          <TabsTrigger value="scenarios" className="gap-2">
            <Lightbulb className="h-4 w-4 hidden sm:block" />
            What-If
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-2">
            <StickyNote className="h-4 w-4 hidden sm:block" />
            Notes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <LoanOverviewTab
            loan={loan}
            payments={payments}
            progress={progress}
            totalPaid={totalPaid}
            totalInterestPaid={totalInterestPaid}
          />
        </TabsContent>

        <TabsContent value="payments">
          <LoanPaymentsScheduleTab loan={loan} payments={payments} />
        </TabsContent>

        <TabsContent value="scenarios">
          <LoanScenariosTab loan={loan} scenarios={scenarios ?? []} />
        </TabsContent>

        <TabsContent value="notes">
          <LoanNotesTab loan={loan} />
        </TabsContent>
      </Tabs>

      {/* Edit Dialog */}
      <EditLoanDialog
        loan={loan}
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
