"use client";

import * as React from "react";
import { BanksCard } from "@/components/atomic/organisms/banksCard";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";

export default function BankingPage() {
  return (
    <div className="relative min-h-screen">
      <div className="container px-4 py-8 relative z-10">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Banking Dashboard</h1>
          <PlaidLinkButton />
        </div>

        <BanksCard />
      </div>
    </div>
  );
}
