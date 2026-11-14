"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
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
    title: "interest.title",
    description: "index.interestDescription",
    icon: TrendingUp,
  },
  {
    href: "/tools/calculators/loan",
    title: "loan.title",
    description: "index.loanDescription",
    icon: HandCoins,
  },
] as const;

export default function CalculatorsPage() {
  const t = useTranslations("calculators");
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader title={t("index.title")} subtitle={t("index.subtitle")} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CALCULATORS.map(({ href, title, description, icon: Icon }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-shadow group-hover:shadow-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icon className="h-5 w-5" />
                  {t(title)}
                  <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
                </CardTitle>
                <CardDescription>{t(description)}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
