"use client";

/**
 * Crypto Integrations - NFTs Page
 *
 * Manage connected NFT marketplaces and collections.
 * Note: NFTs are assets held within wallets/exchanges, not a separate provider type.
 */

import { Card, CardContent } from "@/components/ui/shadcn/card";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import { Image } from "lucide-react";

export default function CryptoIntegrationsNFTsPage() {
  return (
    <div className="space-y-6">
      {/* Coming Soon */}
      <Card>
        <CardContent className="py-12 text-center">
          <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">NFT Tracking Coming Soon</h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            NFTs from your connected wallets and exchanges will appear here.
            Connect a wallet to start tracking your NFT collections.
          </p>
          <VezgoConnectButton />
        </CardContent>
      </Card>
    </div>
  );
}
