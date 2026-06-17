"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Bitcoin, Shield, ArrowRight, ArrowLeft, Wallet } from "lucide-react";
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
import { useBitpandaConnections } from "@/hooks/convex/bitpanda";
import { BitpandaConnectButton } from "@/components/atomic/atoms/BitpandaConnectButton";

interface CryptoStepProps {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function CryptoStep({ onNext, onSkip, onBack }: CryptoStepProps) {
  const updateConnectionStatus = useUpdateConnectionStatus();

  // Bitpanda holds crypto (plus metals/stocks/cash) via a read-only API key
  const connections = useBitpandaConnections();
  const hasConnections = connections && connections.length > 0;

  useEffect(() => {
    if (hasConnections) {
      updateConnectionStatus({
        connectionType: "crypto",
        connected: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasConnections]);

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
            Connect Bitpanda
          </h2>
          <p className="text-white/50">
            Track Bitcoin, Ethereum and 100+ other assets — plus metals, stocks
            and cash
          </p>
        </motion.div>

        {/* Benefits */}
        <motion.div className="mb-8 space-y-3" variants={itemVariants}>
          <BenefitItem
            text="Crypto, precious metals, commodities & stocks in one place"
            delay={0.1}
          />
          <BenefitItem text="Connect with a read-only API key" delay={0.2} />
          <BenefitItem text="Automatic valuation in your base currency" delay={0.3} />
        </motion.div>

        {/* Connected Accounts */}
        {hasConnections && (
          <motion.div className="mb-6" variants={itemVariants}>
            <h3 className="text-sm font-medium text-white/60 mb-3">
              Connected
            </h3>
            <div className="space-y-3">
              {connections.map((connection) => (
                <ConnectionCard
                  key={connection._id}
                  type="crypto"
                  name={connection.label ?? "Bitpanda"}
                  accountCount={1}
                  status={
                    connection.status === "active"
                      ? "connected"
                      : connection.status === "syncing"
                        ? "syncing"
                        : "error"
                  }
                  icon={<Wallet className="w-5 h-5 text-[#D4AF37]" />}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Connect Button Card */}
        <OnboardingCard glow="gold" className="mb-6">
          <OnboardingCardContent>
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 flex items-center justify-center mb-6 border border-[#D4AF37]/20">
                <Bitcoin className="w-12 h-12 text-[#D4AF37]/60" />
              </div>

              <BitpandaConnectButton buttonVariant="secondary" className="w-full">
                {hasConnections ? "Add Another Account" : "Connect Bitpanda"}
              </BitpandaConnectButton>
            </div>
          </OnboardingCardContent>
        </OnboardingCard>

        {/* Security Badge */}
        <motion.div
          className="flex items-center justify-center gap-2 text-white/40 text-sm mb-8"
          variants={itemVariants}
        >
          <Shield className="w-4 h-4" />
          <span>Read-only API key • Encrypted at rest</span>
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
            {hasConnections ? "Continue" : "Continue Without Bitpanda"}
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
