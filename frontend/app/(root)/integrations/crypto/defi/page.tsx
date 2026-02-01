"use client";

/**
 * Crypto Integrations - DeFi Page
 *
 * Manage connected DeFi protocols and positions.
 */

import { Card, CardContent } from "@/components/ui/shadcn/card";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import { Layers } from "lucide-react";

export default function CryptoIntegrationsDeFiPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">DeFi Connections</h2>
          <p className="text-sm text-muted-foreground">
            Manage your connected DeFi protocols and positions
          </p>
        </div>
        <VezgoConnectButton />
      </div>

      {/* Coming Soon */}
      <Card>
        <CardContent className="py-12 text-center">
          <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            DeFi Integration Coming Soon
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Track your DeFi positions including staking, liquidity pools, and
            yield farming across multiple protocols.
          </p>
          <VezgoConnectButton />
        </CardContent>
      </Card>
    </div>
  );
}
