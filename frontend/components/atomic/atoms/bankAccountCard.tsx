"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { PlaidAccount } from "@/lib/types/banking";
import { Building, CreditCard, Wallet } from "lucide-react";

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

export function BankAccountCard({ account }: { account: PlaidAccount }) {
  return (
    <Card key={account.id}>
      <CardHeader className="flex flex-row items-center gap-2">
        <div>
          <CardTitle className="text-base">{account.name}</CardTitle>
          <CardDescription>
            {account.institution?.name || "Bank Account"}
          </CardDescription>
        </div>
        <div className="ml-auto">
          <AccountIcon type={account.type} />
        </div>
      </CardHeader>
      <CardContent>
        <div>
          {account.balance && (
            <>
              <p className="font-semibold text-2xl">
                {account.balance.current.toLocaleString(undefined, {
                  style: "currency",
                  currency: account.balance.currency,
                })}
              </p>
              <p className="text-sm text-muted-foreground">
                Available:{" "}
                {account.balance.available.toLocaleString(undefined, {
                  style: "currency",
                  currency: account.balance.currency,
                })}
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
