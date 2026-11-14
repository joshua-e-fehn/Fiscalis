"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Building, CreditCard, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils/currency";

// Account type from Convex
export interface ConvexAccount {
  _id: string;
  accountId: string;
  name: string;
  officialName?: string;
  type: string;
  subtype?: string;
  mask?: string;
  currentBalance?: number;
  availableBalance?: number;
  currency: string;
  institutionName?: string;
}

// Account icon based on type
const AccountIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "depository":
      return <Building className="h-6 w-6" />;
    case "credit":
      return <CreditCard className="h-6 w-6" />;
    default:
      return <Wallet className="h-6 w-6" />;
  }
};

export function BankAccountCard({ account }: { account: ConvexAccount }) {
  const hasBalance = account.currentBalance !== undefined;
  // The provider's balances, in the account's own currency; without one
  // they are not shown rather than labelled with a guessed currency
  const formatBalance = (amount: number) =>
    account.currency ? formatCurrency(amount, account.currency) : "—";

  return (
    <Card key={account._id}>
      <CardHeader className="flex flex-row items-center gap-2">
        <div>
          <CardTitle className="text-base">{account.name}</CardTitle>
          <CardDescription>
            {account.officialName || account.subtype || "Bank Account"}
          </CardDescription>
        </div>
        <div className="ml-auto">
          <AccountIcon type={account.type} />
        </div>
      </CardHeader>
      <CardContent>
        <div>
          {hasBalance && (
            <>
              <p className="font-semibold text-2xl">
                {formatBalance(account.currentBalance!)}
              </p>
              {account.availableBalance !== undefined && (
                <p className="text-sm text-muted-foreground">
                  Available:{" "}
                  {formatBalance(account.availableBalance)}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
