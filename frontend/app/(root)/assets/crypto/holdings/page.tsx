"use client";

/**
 * Crypto Holdings Page
 *
 * Complete list of all cryptocurrency positions across all connected accounts.
 * Moved from the overview page to its own dedicated tab.
 */

import Link from "next/link";
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            All Crypto Holdings
          </CardTitle>
          <CardDescription>
            Complete list of your cryptocurrency holdings across all connected
            exchanges and wallets
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasConnections ? (
            <CryptoPositionsTable showFilters />
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium mb-2">
                No crypto accounts connected
              </p>
              <p className="mb-6">
                Connect your crypto exchanges and wallets to see your complete
                holdings
              </p>
              <Button variant="outline" asChild>
                <Link href="/integrations/brokers">
                  Connect Crypto Accounts
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
