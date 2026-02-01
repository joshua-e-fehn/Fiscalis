"use client";

/**
 * Crypto Integrations - NFTs Page
 *
 * Manage connected NFT marketplaces and collections.
 */

import { Card, CardContent } from "@/components/ui/shadcn/card";
import { VezgoConnectButton } from "@/components/atomic/atoms/VezgoConnectButton";
import { Image } from "lucide-react";

export default function CryptoIntegrationsNFTsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">NFT Connections</h2>
          <p className="text-sm text-muted-foreground">
            Manage your connected NFT marketplaces and collections
          </p>
        </div>
        <VezgoConnectButton />
      </div>

      {/* Coming Soon */}
      <Card>
        <CardContent className="py-12 text-center">
          <Image className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">
            NFT Integration Coming Soon
          </h3>
          <p className="text-sm text-muted-foreground mb-4 max-w-md mx-auto">
            Track your NFT collections and valuations across multiple
            marketplaces including OpenSea, Blur, and more.
          </p>
          <VezgoConnectButton />
        </CardContent>
      </Card>
    </div>
  );
}
