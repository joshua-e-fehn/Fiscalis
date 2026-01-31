"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Bitcoin,
  Shield,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Loader2,
  Wallet,
  HardDrive,
} from "lucide-react";
import { OnboardingButton } from "../shared/OnboardingButton";
import {
  OnboardingCard,
  OnboardingCardContent,
} from "../shared/OnboardingCard";
import { SkipButton } from "../shared/SkipButton";
import { BenefitItem } from "../shared/FeatureItem";
import { ConnectionCard } from "../shared/ConnectionCard";
import { containerVariants, itemVariants } from "@/lib/types/onboarding";
import { useUpdateConnectionStatus } from "@/hooks/convex/onboarding";

interface CryptoStepProps {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

// Supported platforms (placeholder data)
const SUPPORTED_EXCHANGES = [
  { name: "Coinbase", type: "exchange" },
  { name: "Binance", type: "exchange" },
  { name: "Kraken", type: "exchange" },
  { name: "Crypto.com", type: "exchange" },
];

const SUPPORTED_WALLETS = [
  { name: "MetaMask", type: "wallet" },
  { name: "Ledger", type: "hardware" },
  { name: "Trezor", type: "hardware" },
];

export function CryptoStep({ onNext, onSkip, onBack }: CryptoStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);

  const registerUser = useAction(api.actions.vezgo.registerUser);
  const getConnectUrl = useAction(api.actions.vezgo.getConnectUrl);
  const updateConnectionStatus = useUpdateConnectionStatus();

  // Get existing crypto connections
  const cryptoConnections = useQuery(api.crypto.getConnections);
  const hasConnections = cryptoConnections && cryptoConnections.length > 0;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // First, ensure user is registered with Vezgo
      await registerUser();

      // Get the connection URL
      const currentUrl =
        typeof window !== "undefined" ? window.location.href : "";
      const result = await getConnectUrl({
        redirectUri: currentUrl,
      });

      if (result.connectUrl) {
        setConnectUrl(result.connectUrl);
        // Open in new window/tab
        window.open(result.connectUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Failed to initiate crypto connection:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Update connection status when crypto connections change
  useEffect(() => {
    if (hasConnections) {
      updateConnectionStatus({
        connectionType: "crypto",
        connected: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasConnections]); // Only depend on hasConnections, not the mutation function

  return (
    <div className="flex flex-col items-center px-4 py-8">
      <motion.div
        className="w-full max-w-lg mx-auto"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div className="text-center mb-8" variants={itemVariants}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#D4AF37]/10 border border-[#D4AF37]/20 mb-4">
            <Bitcoin className="w-8 h-8 text-[#D4AF37]" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Connect Your Crypto Wallets
          </h2>
          <p className="text-white/50">
            Track Bitcoin, Ethereum, and 100+ other assets
          </p>
        </motion.div>

        {/* Benefits */}
        <motion.div className="mb-8 space-y-3" variants={itemVariants}>
          <BenefitItem
            text="Exchange connections (Coinbase, Binance, Kraken)"
            delay={0.1}
          />
          <BenefitItem
            text="Wallet support (MetaMask, Ledger, Trezor)"
            delay={0.2}
          />
          <BenefitItem text="DeFi position & staking tracking" delay={0.3} />
        </motion.div>

        {/* Connected Accounts */}
        {hasConnections && (
          <motion.div className="mb-6" variants={itemVariants}>
            <h3 className="text-sm font-medium text-white/60 mb-3">
              Connected Wallets
            </h3>
            <div className="space-y-3">
              {cryptoConnections.map((connection) => (
                <ConnectionCard
                  key={connection._id}
                  type="crypto"
                  name={connection.name}
                  accountCount={1}
                  status={
                    connection.status === "active"
                      ? "connected"
                      : connection.status === "syncing"
                        ? "syncing"
                        : "error"
                  }
                  icon={
                    connection.providerType === "hardware" ? (
                      <HardDrive className="w-5 h-5 text-[#D4AF37]" />
                    ) : connection.providerType === "wallet" ? (
                      <Wallet className="w-5 h-5 text-[#D4AF37]" />
                    ) : (
                      <Bitcoin className="w-5 h-5 text-[#D4AF37]" />
                    )
                  }
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Supported Platforms */}
        <motion.div className="mb-6 space-y-4" variants={itemVariants}>
          {/* Exchanges */}
          <div>
            <h3 className="text-sm font-medium text-white/40 mb-2 text-center">
              Exchanges
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {SUPPORTED_EXCHANGES.map((platform) => (
                <div
                  key={platform.name}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-white/50 text-xs"
                >
                  {platform.name}
                </div>
              ))}
            </div>
          </div>

          {/* Wallets */}
          <div>
            <h3 className="text-sm font-medium text-white/40 mb-2 text-center">
              Wallets
            </h3>
            <div className="flex flex-wrap justify-center gap-2">
              {SUPPORTED_WALLETS.map((platform) => (
                <div
                  key={platform.name}
                  className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-white/50 text-xs"
                >
                  {platform.name}
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Connect Button Card */}
        <OnboardingCard glow="gold" className="mb-6">
          <OnboardingCardContent>
            <div className="flex flex-col items-center text-center py-4">
              {/* Illustration placeholder */}
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 flex items-center justify-center mb-6 border border-[#D4AF37]/20">
                <Bitcoin className="w-12 h-12 text-[#D4AF37]/60" />
              </div>

              <OnboardingButton
                onClick={handleConnect}
                isLoading={isConnecting}
                variant="secondary"
                icon={
                  isConnecting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ExternalLink className="w-5 h-5" />
                  )
                }
                className="w-full"
              >
                {isConnecting
                  ? "Opening Connection..."
                  : hasConnections
                    ? "Add Another Wallet"
                    : "Connect Crypto Account"}
              </OnboardingButton>

              {connectUrl && (
                <p className="text-white/40 text-xs mt-3">
                  A new window should have opened. Complete the connection
                  there.
                </p>
              )}
            </div>
          </OnboardingCardContent>
        </OnboardingCard>

        {/* Security Badge */}
        <motion.div
          className="flex items-center justify-center gap-2 text-white/40 text-sm mb-8"
          variants={itemVariants}
        >
          <Shield className="w-4 h-4" />
          <span>Secure connection via Vezgo • Read-only access</span>
        </motion.div>

        {/* Actions */}
        <motion.div
          className="flex flex-col items-center gap-4"
          variants={itemVariants}
        >
          <OnboardingButton
            onClick={onNext}
            size="lg"
            className="w-full"
            icon={<ArrowRight className="w-5 h-5" />}
          >
            {hasConnections ? "Continue" : "Continue Without Crypto"}
          </OnboardingButton>
          <div className="flex items-center gap-4">
            <OnboardingButton
              onClick={onBack}
              variant="ghost"
              icon={<ArrowLeft className="w-4 h-4" />}
            >
              Back
            </OnboardingButton>
            {!hasConnections && <SkipButton onClick={onSkip} />}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
