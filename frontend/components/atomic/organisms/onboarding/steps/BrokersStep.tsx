"use client";

import { useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  LineChart,
  Shield,
  ArrowRight,
  ArrowLeft,
  Plus,
  Loader2,
  ExternalLink,
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

interface BrokersStepProps {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

// Supported broker logos (placeholder data)
const SUPPORTED_BROKERS = [
  { name: "Interactive Brokers", logo: "IBKR" },
  { name: "Fidelity", logo: "FID" },
  { name: "Charles Schwab", logo: "SCHW" },
  { name: "TD Ameritrade", logo: "TDA" },
  { name: "Robinhood", logo: "RH" },
  { name: "E*TRADE", logo: "ET" },
];

export function BrokersStep({ onNext, onSkip, onBack }: BrokersStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);

  const registerUser = useAction(api.actions.snaptrade.registerUser);
  const getConnectUrl = useAction(api.actions.snaptrade.createConnectUrl);
  const updateConnectionStatus = useUpdateConnectionStatus();

  // Get existing broker connections
  const brokerConnections = useQuery(api.brokers.getConnections);
  const hasConnections = brokerConnections && brokerConnections.length > 0;

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      // First, ensure user is registered with SnapTrade
      await registerUser();

      // Get the connection URL
      const result = await getConnectUrl({});

      if (result.connectUrl) {
        setRedirectUrl(result.connectUrl);
        // Open in new window/tab
        window.open(result.connectUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Failed to initiate broker connection:", error);
    } finally {
      setIsConnecting(false);
    }
  };

  // Listen for connection success (user returns from SnapTrade)
  useEffect(() => {
    const handleFocus = () => {
      // Refetch connections when window regains focus
      // This helps detect when user returns from SnapTrade
    };
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, []);

  // Update connection status when broker connections change
  useEffect(() => {
    if (hasConnections) {
      updateConnectionStatus({
        connectionType: "brokers",
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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#3B82F6]/10 border border-[#3B82F6]/20 mb-4">
            <LineChart className="w-8 h-8 text-[#3B82F6]" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Connect Your Investment Accounts
          </h2>
          <p className="text-white/50">
            Import your stocks, ETFs, and bonds automatically
          </p>
        </motion.div>

        {/* Benefits */}
        <motion.div className="mb-8 space-y-3" variants={itemVariants}>
          <BenefitItem text="Real-time portfolio updates" delay={0.1} />
          <BenefitItem text="Support for 15+ brokerages" delay={0.2} />
          <BenefitItem text="Dividend & performance tracking" delay={0.3} />
        </motion.div>

        {/* Connected Accounts */}
        {hasConnections && (
          <motion.div className="mb-6" variants={itemVariants}>
            <h3 className="text-sm font-medium text-white/60 mb-3">
              Connected Brokers
            </h3>
            <div className="space-y-3">
              {brokerConnections.map((connection) => (
                <ConnectionCard
                  key={connection._id}
                  type="broker"
                  name={connection.brokerName}
                  accountCount={1}
                  status={
                    connection.status === "connected"
                      ? "connected"
                      : connection.status === "syncing"
                        ? "syncing"
                        : "error"
                  }
                  icon={<LineChart className="w-5 h-5 text-[#3B82F6]" />}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Supported Brokers */}
        <motion.div className="mb-6" variants={itemVariants}>
          <h3 className="text-sm font-medium text-white/40 mb-3 text-center">
            Supported Brokers
          </h3>
          <div className="flex flex-wrap justify-center gap-2">
            {SUPPORTED_BROKERS.map((broker) => (
              <div
                key={broker.name}
                className="px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.05] text-white/50 text-xs"
              >
                {broker.name}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Connect Button Card */}
        <OnboardingCard glow="blue" className="mb-6">
          <OnboardingCardContent>
            <div className="flex flex-col items-center text-center py-4">
              {/* Illustration placeholder */}
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#3B82F6]/20 to-[#3B82F6]/5 flex items-center justify-center mb-6 border border-[#3B82F6]/20">
                <LineChart className="w-12 h-12 text-[#3B82F6]/60" />
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
                    ? "Add Another Broker"
                    : "Connect Brokerage Account"}
              </OnboardingButton>

              {redirectUrl && (
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
          <span>Secure connection via SnapTrade • Read-only access</span>
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
            {hasConnections ? "Continue" : "Continue Without Brokers"}
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
