"use client";

import { Doc } from "@/convex/_generated/dataModel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Badge } from "@/components/ui/shadcn/badge";
import {
  Home,
  Car,
  GraduationCap,
  Building2,
  CreditCard,
  Banknote,
  HandCoins,
  ChevronRight,
  Calendar,
  Percent,
  TrendingDown,
} from "lucide-react";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

type Loan = Doc<"loans">;

interface LoanCardProps {
  loan: Loan;
  viewMode: "grid" | "list";
  onClick: () => void;
}

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

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getLoanIcon(name: string) {
  const lowerName = name.toLowerCase();
  if (
    lowerName.includes("mortgage") ||
    lowerName.includes("home") ||
    lowerName.includes("house")
  ) {
    return <Home className="h-5 w-5" />;
  }
  if (
    lowerName.includes("car") ||
    lowerName.includes("auto") ||
    lowerName.includes("vehicle")
  ) {
    return <Car className="h-5 w-5" />;
  }
  if (
    lowerName.includes("student") ||
    lowerName.includes("education") ||
    lowerName.includes("school")
  ) {
    return <GraduationCap className="h-5 w-5" />;
  }
  if (lowerName.includes("business") || lowerName.includes("commercial")) {
    return <Building2 className="h-5 w-5" />;
  }
  if (lowerName.includes("credit") || lowerName.includes("card")) {
    return <CreditCard className="h-5 w-5" />;
  }
  if (lowerName.includes("personal")) {
    return <Banknote className="h-5 w-5" />;
  }
  return <HandCoins className="h-5 w-5" />;
}

function getLoanColor(name: string): string {
  const lowerName = name.toLowerCase();
  if (
    lowerName.includes("mortgage") ||
    lowerName.includes("home") ||
    lowerName.includes("house")
  ) {
    return "bg-blue-100 text-blue-600";
  }
  if (
    lowerName.includes("car") ||
    lowerName.includes("auto") ||
    lowerName.includes("vehicle")
  ) {
    return "bg-green-100 text-green-600";
  }
  if (
    lowerName.includes("student") ||
    lowerName.includes("education") ||
    lowerName.includes("school")
  ) {
    return "bg-purple-100 text-purple-600";
  }
  if (lowerName.includes("business") || lowerName.includes("commercial")) {
    return "bg-cyan-100 text-cyan-600";
  }
  if (lowerName.includes("credit") || lowerName.includes("card")) {
    return "bg-red-100 text-red-600";
  }
  if (lowerName.includes("personal")) {
    return "bg-orange-100 text-orange-600";
  }
  return "bg-gray-100 text-gray-600";
}

function getRemainingTime(loan: Loan): string {
  if (loan.status === "paid_off") return "Paid off";

  const today = new Date();
  const endDate = new Date(loan.expectedEndDate);
  const months =
    (endDate.getFullYear() - today.getFullYear()) * 12 +
    (endDate.getMonth() - today.getMonth());

  if (months <= 0) return "Overdue";
  if (months < 12) return `${months}m left`;

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (remainingMonths === 0) return `${years}y left`;
  return `${years}y ${remainingMonths}m left`;
}

// ═══════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════

export function LoanCard({ loan, viewMode, onClick }: LoanCardProps) {
  const progress =
    ((loan.originalPrincipal - loan.currentBalance) / loan.originalPrincipal) *
    100;

  if (viewMode === "list") {
    return (
      <Card
        className="cursor-pointer hover:shadow-md transition-shadow"
        onClick={onClick}
      >
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-lg ${getLoanColor(loan.name)}`}>
                {getLoanIcon(loan.name)}
              </div>
              <div>
                <h3 className="font-semibold">{loan.name}</h3>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {loan.lender && <span>{loan.lender}</span>}
                  <span className="flex items-center gap-1">
                    <Percent className="h-3 w-3" />
                    {formatPercent(loan.annualInterestRate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-8">
              <div className="text-right hidden md:block">
                <p className="text-sm text-muted-foreground">Balance</p>
                <p className="font-semibold">
                  {formatCurrency(loan.currentBalance, loan.currency)}
                </p>
              </div>
              <div className="text-right hidden lg:block">
                <p className="text-sm text-muted-foreground">Payment</p>
                <p className="font-semibold">
                  {formatCurrency(loan.scheduledPayment, loan.currency)}
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-sm text-muted-foreground">Next Due</p>
                <p className="font-semibold">
                  {formatDate(loan.nextPaymentDate)}
                </p>
              </div>
              <div className="w-24 hidden md:block">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span>{progress.toFixed(0)}%</span>
                  <span className="text-muted-foreground">
                    {getRemainingTime(loan)}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Grid view
  return (
    <Card
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className={`p-3 rounded-lg ${getLoanColor(loan.name)}`}>
            {getLoanIcon(loan.name)}
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="text-lg truncate">{loan.name}</CardTitle>
            {loan.lender && (
              <p className="text-sm text-muted-foreground truncate">
                {loan.lender}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Balance */}
        <div>
          <p className="text-2xl font-bold">
            {formatCurrency(loan.currentBalance, loan.currency)}
          </p>
          <p className="text-sm text-muted-foreground">
            of {formatCurrency(loan.originalPrincipal, loan.currency)} original
          </p>
        </div>

        {/* Interest Rate & Payment */}
        <div className="flex justify-between text-sm">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Percent className="h-4 w-4" />
            <span>{formatPercent(loan.annualInterestRate)}</span>
          </div>
          <div className="flex items-center gap-1 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              {formatCurrency(loan.scheduledPayment, loan.currency)}/mo
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="font-medium">{progress.toFixed(1)}% paid</span>
            <span className="text-muted-foreground">
              {getRemainingTime(loan)}
            </span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Next Payment */}
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-sm text-muted-foreground">Next payment</span>
          <Badge variant="secondary">{formatDate(loan.nextPaymentDate)}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
