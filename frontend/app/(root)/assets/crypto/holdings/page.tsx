"use client";

/**
 * Crypto Holdings Page
 *
 * Complete list of all cryptocurrency positions across all connected accounts.
 * Moved from the overview page to its own dedicated tab.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { ArrowRight, Wallet } from "lucide-react";
import { CryptoPositionsTable } from "@/components/atomic/molecules/crypto";
import { useHasCryptoHoldings } from "@/hooks/convex/crypto";

export default function CryptoHoldingsPage() {
  const hasConnections = useHasCryptoHoldings();
  const t = useTranslations("assets.crypto.holdings");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {hasConnections ? (
            <CryptoPositionsTable showFilters />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">{t("emptyTitle")}</p>
              <p className="mb-6">{t("emptyDescription")}</p>
              <Button variant="outline" asChild>
                <Link href="/integrations/brokers">
                  {t("connect")}
                  <ArrowRight className="ms-2 h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
