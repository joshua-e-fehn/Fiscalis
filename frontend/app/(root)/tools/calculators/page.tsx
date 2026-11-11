"use client";

import Link from "next/link";
import { ArrowRight, HandCoins, TrendingUp } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { PageHeader } from "@/components/atomic/molecules/investments";

// Hub for the calculators; each one lives on its own page
const CALCULATORS = [
  {
    href: "/tools/calculators/interest",
    title: "Interest Calculators",
    description:
      "Interest rates, growth duration, future and present values with simple or compound interest.",
    icon: TrendingUp,
  },
  {
    href: "/tools/calculators/loan",
    title: "Loan Calculator",
    description:
      "Payments, total interest and amortization for annuity, declining, interest-only and bullet loans, with prepayments.",
    icon: HandCoins,
  },
];

export default function CalculatorsPage() {
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title="Calculators"
        subtitle="Financial tools to help you make better investment and borrowing decisions."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CALCULATORS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {title}
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
