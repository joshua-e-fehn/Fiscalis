"use client";

import { useAccounts } from "@/hooks/banking";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Landmark } from "lucide-react";

import { BankAccountCard } from "@/components/atomic/atoms/bankAccountCard";
import { PlaidAccount } from "@/lib/types/banking";

export function BankAccountsCard({
  institutionAccounts,
}: {
  institutionAccounts: PlaidAccount[];
}) {
  if (!institutionAccounts || institutionAccounts.length === 0) {
    return null;
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-xl flex flex-row items-center gap-2">
          <Landmark className="h-7 w-7" />{" "}
          {institutionAccounts[0]?.institution?.name}
        </CardTitle>
        <CardDescription>
          You have connected {institutionAccounts.length} accounts
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {institutionAccounts.map((account) => (
          <BankAccountCard key={account.id} account={account} />
        ))}
      </CardContent>
    </Card>
  );
}
