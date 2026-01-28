"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import {
  useActiveLoans,
  useLoansSummary,
  useUpcomingPayments,
} from "@/hooks/convex/loans";
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
  HandCoins,
  Plus,
  Calendar,
  TrendingDown,
  Wallet,
  Clock,
  ChevronRight,
  AlertCircle,
  Building2,
  Car,
  Home,
  GraduationCap,
  CreditCard,
  Banknote,
  LayoutGrid,
  List,
} from "lucide-react";
import { AddLoanDialog } from "@/components/atomic/organisms/loans/add-loan-dialog";
import { LoanCard } from "@/components/atomic/molecules/loans/loan-card";
import { Id } from "@/convex/_generated/dataModel";

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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getDaysUntil(dateString: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateString);
  target.setHours(0, 0, 0, 0);
  return Math.ceil(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function LoansPage() {
  const { user } = useUser();
  const router = useRouter();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const loans = useActiveLoans(user?.id);
  const summary = useLoansSummary(user?.id);
  const upcomingPayments = useUpcomingPayments(user?.id, 30);

  const isLoading = loans === undefined || summary === undefined;

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div className="flex items-center gap-3">
          <HandCoins className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">My Loans</h1>
            <p className="text-muted-foreground">Track and manage your debt</p>
          </div>
        </div>
        <Button onClick={() => setShowAddDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Loan
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          title="Total Debt"
          value={summary ? formatCurrency(summary.totalDebt) : undefined}
          icon={<Wallet className="h-5 w-5" />}
          description={`${summary?.loansCount ?? 0} active loans`}
          isLoading={isLoading}
        />
        <SummaryCard
          title="Monthly Payments"
          value={
            summary ? formatCurrency(summary.totalMonthlyPayments) : undefined
          }
          icon={<Calendar className="h-5 w-5" />}
          description="Combined monthly total"
          isLoading={isLoading}
        />
        <SummaryCard
          title="Next Payment"
          value={
            summary?.nextPayment
              ? formatCurrency(summary.nextPayment.amount)
              : "No payments"
          }
          icon={<Clock className="h-5 w-5" />}
          description={
            summary?.nextPayment
              ? `${summary.nextPayment.loanName} • ${formatShortDate(summary.nextPayment.date)}`
              : "No active loans"
          }
          isLoading={isLoading}
        />
        <SummaryCard
          title="Payoff Progress"
          value={summary ? `${summary.overallProgress.toFixed(1)}%` : undefined}
          icon={<TrendingDown className="h-5 w-5" />}
          description="Overall debt paid off"
          isLoading={isLoading}
          showProgress
          progress={summary?.overallProgress ?? 0}
        />
      </div>

      {/* Upcoming Payments */}
      {upcomingPayments && upcomingPayments.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-lg">Upcoming Payments</CardTitle>
              </div>
              <Badge variant="secondary">{upcomingPayments.length} due</Badge>
            </div>
            <CardDescription>Payments due in the next 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingPayments.slice(0, 5).map((payment) => {
                const daysUntil = getDaysUntil(payment.paymentDate);
                const isUrgent = daysUntil <= 3;
                const isDueSoon = daysUntil <= 7;

                return (
                  <div
                    key={`${payment.loanId}-${payment.paymentDate}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => router.push(`/debt/loans/${payment.loanId}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`p-2 rounded-full ${
                          isUrgent
                            ? "bg-red-100 text-red-600"
                            : isDueSoon
                              ? "bg-orange-100 text-orange-600"
                              : "bg-blue-100 text-blue-600"
                        }`}
                      >
                        <Calendar className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-medium">{payment.loanName}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(payment.paymentDate)}
                          {daysUntil === 0
                            ? " (Today)"
                            : daysUntil === 1
                              ? " (Tomorrow)"
                              : ` (in ${daysUntil} days)`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold">
                        {formatCurrency(payment.amount, payment.currency)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loans List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Active Loans</h2>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("list")}
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isLoading ? (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                : "space-y-4"
            }
          >
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full" />
            ))}
          </div>
        ) : loans && loans.length > 0 ? (
          <div
            className={
              viewMode === "grid"
                ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                : "space-y-4"
            }
          >
            {loans.map((loan) => (
              <LoanCard
                key={loan._id}
                loan={loan}
                viewMode={viewMode}
                onClick={() => router.push(`/debt/loans/${loan._id}`)}
              />
            ))}
          </div>
        ) : (
          <EmptyState onAddLoan={() => setShowAddDialog(true)} />
        )}
      </div>

      {/* Add Loan Dialog */}
      <AddLoanDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Sub Components
// ═══════════════════════════════════════════════════════════════

function SummaryCard({
  title,
  value,
  icon,
  description,
  isLoading,
  showProgress,
  progress,
}: {
  title: string;
  value: string | undefined;
  icon: React.ReactNode;
  description: string;
  isLoading: boolean;
  showProgress?: boolean;
  progress?: number;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">{title}</span>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        {isLoading ? (
          <Skeleton className="h-8 w-24 mb-1" />
        ) : (
          <p className="text-2xl font-bold">{value}</p>
        )}
        <p className="text-xs text-muted-foreground">{description}</p>
        {showProgress && !isLoading && (
          <div className="mt-3">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${progress ?? 0}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ onAddLoan }: { onAddLoan: () => void }) {
  return (
    <Card className="p-12">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-muted">
            <HandCoins className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        <h3 className="text-lg font-semibold mb-2">No loans yet</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          Start tracking your loans to get insights on your debt, payment
          schedules, and see how extra payments can help you save.
        </p>
        <Button onClick={onAddLoan}>
          <Plus className="h-4 w-4 mr-2" />
          Add Your First Loan
        </Button>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Home className="h-5 w-5 text-blue-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Mortgage</p>
              <p className="text-xs text-muted-foreground">Home loans</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Car className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Auto Loan</p>
              <p className="text-xs text-muted-foreground">Vehicle financing</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <GraduationCap className="h-5 w-5 text-purple-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Student Loan</p>
              <p className="text-xs text-muted-foreground">Education debt</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Banknote className="h-5 w-5 text-orange-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Personal Loan</p>
              <p className="text-xs text-muted-foreground">Unsecured loans</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <CreditCard className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Credit Card</p>
              <p className="text-xs text-muted-foreground">Revolving credit</p>
            </div>
          </div>
          <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
            <Building2 className="h-5 w-5 text-cyan-500 mt-0.5" />
            <div>
              <p className="font-medium text-sm">Business Loan</p>
              <p className="text-xs text-muted-foreground">Commercial loans</p>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
