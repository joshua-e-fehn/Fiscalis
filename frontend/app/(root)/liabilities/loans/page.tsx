"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
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
  HandCoins,
} from "lucide-react";
import { AddLoanDialog } from "@/components/atomic/organisms/loans/add-loan-dialog";
import { LoanCard } from "@/components/atomic/molecules/loans/loan-card";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { todayLocalISO } from "@/lib/utils/date";
import { formatCurrency as formatMoney } from "@/lib/utils/currency";

// ═══════════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════════

function formatCurrency(value: number, currency: string = "USD"): string {
  return formatMoney(value, currency, { fractionDigits: 0 });
}

// The per-currency totals, each in its loan currency: "1'000€ + 2'000$"
function formatTotals<T extends { currency: string }>(
  totals: T[],
  pick: (t: T) => number,
): string {
  // No loans: no currency to format in
  if (totals.length === 0) return "—";
  return totals.map((t) => formatCurrency(pick(t), t.currency)).join(" + ");
}

function getDaysUntil(dateString: string): number {
  return Math.round(
    (Date.parse(dateString) - Date.parse(todayLocalISO())) / 86_400_000,
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Component
// ═══════════════════════════════════════════════════════════════

export default function LoansPage() {
  const router = useRouter();
  const t = useTranslations("loans.list");
  const format = useFormatter();
  // Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight
  const formatDate = (date: string) =>
    format.dateTime(new Date(date), "dateOnly");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showAddDialog, setShowAddDialog] = useState(false);

  const loans = useActiveLoans();
  const summary = useLoansSummary();
  const upcomingPayments = useUpcomingPayments(30);

  const isLoading = loans === undefined || summary === undefined;
  const totals = summary?.totals ?? [];
  const combined = summary?.combined ?? null;
  // The breakdown only adds something when a loan is in another currency
  // than the combined figure
  const showBreakdown =
    combined !== null &&
    totals.some((t) => t.currency.toLowerCase() !== combined.currency);
  // One currency: balance-weighted; mixed currencies: the average per loan
  const overallProgress =
    totals.length === 1
      ? totals[0].overallProgress
      : loans && loans.length > 0
        ? loans.reduce((sum, loan) => sum + loan.kpis.progress, 0) /
          loans.length
        : 0;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actionsLoading={isLoading}
        actions={[
          { label: t("addLoan"), onClick: () => setShowAddDialog(true) },
        ]}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          title={t("totalDebt")}
          value={
            summary
              ? combined
                ? formatCurrency(combined.totalDebt, combined.currency)
                : formatTotals(totals, (t) => t.totalDebt)
              : undefined
          }
          detail={
            showBreakdown
              ? formatTotals(totals, (t) => t.totalDebt)
              : undefined
          }
          icon={<Wallet className="h-5 w-5" />}
          description={t("activeLoansCount", {
            count: summary?.loansCount ?? 0,
          })}
          isLoading={isLoading}
        />
        <SummaryCard
          title={t("monthlyPayments")}
          value={
            summary
              ? combined
                ? formatCurrency(combined.totalMonthlyPayments, combined.currency)
                : formatTotals(totals, (t) => t.totalMonthlyPayments)
              : undefined
          }
          detail={
            showBreakdown
              ? formatTotals(totals, (t) => t.totalMonthlyPayments)
              : undefined
          }
          icon={<Calendar className="h-5 w-5" />}
          description={t("monthlyCombined")}
          isLoading={isLoading}
        />
        <SummaryCard
          title={t("nextPayment")}
          value={
            summary?.nextPayment
              ? formatCurrency(
                  summary.nextPayment.amount,
                  summary.nextPayment.currency,
                )
              : t("noPayments")
          }
          icon={<Clock className="h-5 w-5" />}
          description={
            summary?.nextPayment
              ? t("nextPaymentDetail", {
                  loan: summary.nextPayment.loanName,
                  date: formatDate(summary.nextPayment.date),
                })
              : t("noActiveLoans")
          }
          isLoading={isLoading}
        />
        <SummaryCard
          title={t("payoffProgress")}
          value={summary ? `${overallProgress.toFixed(1)}%` : undefined}
          icon={<TrendingDown className="h-5 w-5" />}
          description={
            totals.length > 1
              ? t("averagePaidOff")
              : t("overallPaidOff")
          }
          isLoading={isLoading}
          showProgress
          progress={overallProgress}
        />
      </div>

      {/* Upcoming Payments */}
      {upcomingPayments && upcomingPayments.length > 0 && (
        <Card className="mb-8">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-orange-500" />
                <CardTitle className="text-lg">{t("upcomingTitle")}</CardTitle>
              </div>
              <Badge variant="secondary">
                {t("upcomingCount", { count: upcomingPayments.length })}
              </Badge>
            </div>
            <CardDescription>
              {t("upcomingDescription")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingPayments.slice(0, 5).map((payment) => {
                const daysUntil = getDaysUntil(payment.paymentDate);
                const isUrgent = payment.overdue || daysUntil <= 3;
                const isDueSoon = daysUntil <= 7;

                return (
                  <div
                    key={`${payment.loanId}-${payment.paymentDate}`}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors cursor-pointer"
                    onClick={() => router.push(`/liabilities/loans/${payment.loanId}`)}
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
                          {t("upcomingDate", {
                            date: formatDate(payment.paymentDate),
                            when: payment.overdue
                              ? t("overdueBy", { days: -daysUntil })
                              : daysUntil === 0
                                ? t("dueToday")
                                : daysUntil === 1
                                  ? t("dueTomorrow")
                                  : t("dueInDays", { days: daysUntil }),
                          })}
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
          <h2 className="text-xl font-semibold">{t("activeLoans")}</h2>
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === "grid" ? "secondary" : "ghost"}
              size="sm"
              aria-label={t("gridView")}
              onClick={() => setViewMode("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "secondary" : "ghost"}
              size="sm"
              aria-label={t("listView")}
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
                onClick={() => router.push(`/liabilities/loans/${loan._id}`)}
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
  detail,
  icon,
  description,
  isLoading,
  showProgress,
  progress,
}: {
  title: string;
  value: string | undefined;
  /** A secondary figure under the value, e.g. the per-currency breakdown */
  detail?: string;
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
        {detail && !isLoading && (
          <p className="text-sm text-muted-foreground">{detail}</p>
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

const LOAN_EXAMPLES = [
  { key: "mortgage", icon: Home, color: "text-blue-500" },
  { key: "auto", icon: Car, color: "text-green-500" },
  { key: "student", icon: GraduationCap, color: "text-purple-500" },
  { key: "personal", icon: Banknote, color: "text-orange-500" },
  { key: "creditCard", icon: CreditCard, color: "text-red-500" },
  { key: "business", icon: Building2, color: "text-cyan-500" },
] as const;

function EmptyState({ onAddLoan }: { onAddLoan: () => void }) {
  const t = useTranslations("loans.list");
  return (
    <Card className="p-12">
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="p-4 rounded-full bg-muted">
            <HandCoins className="h-12 w-12 text-muted-foreground" />
          </div>
        </div>
        <h3 className="text-lg font-semibold mb-2">{t("emptyTitle")}</h3>
        <p className="text-muted-foreground mb-6 max-w-md mx-auto">
          {t("emptyDescription")}
        </p>
        <Button onClick={onAddLoan}>
          <Plus className="h-4 w-4 mr-2" />
          {t("addFirst")}
        </Button>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-3 gap-4 text-left max-w-2xl mx-auto">
          {LOAN_EXAMPLES.map(({ key, icon: Icon, color }) => (
            <div
              key={key}
              className="flex items-start gap-2 p-3 rounded-lg bg-muted/50"
            >
              <Icon className={`h-5 w-5 ${color} mt-0.5`} />
              <div>
                <p className="font-medium text-sm">
                  {t(`examples.${key}.title`)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`examples.${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
