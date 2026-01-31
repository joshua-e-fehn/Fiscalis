"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import { usePlaidLink } from "react-plaid-link";
import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Building2,
  Shield,
  RefreshCw,
  Globe2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Loader2,
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

interface BankingStepProps {
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function BankingStep({ onNext, onSkip, onBack }: BankingStepProps) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isCreatingLink, setIsCreatingLink] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);

  const createLinkToken = useAction(api.actions.plaid.createLinkToken);
  const exchangePublicToken = useAction(api.actions.plaid.exchangeToken);
  const updateConnectionStatus = useUpdateConnectionStatus();

  // Get existing bank accounts
  const plaidAccounts = useQuery(api.banking.getAccounts);
  const hasConnections = plaidAccounts && plaidAccounts.length > 0;

  const handleCreateLink = async () => {
    setIsCreatingLink(true);
    try {
      const result = await createLinkToken();
      setLinkToken(result.linkToken);
    } catch (error) {
      console.error("Failed to create link token:", error);
    } finally {
      setIsCreatingLink(false);
    }
  };

  const onPlaidSuccess = useCallback(
    async (publicToken: string) => {
      setIsExchanging(true);
      try {
        await exchangePublicToken({ publicToken });
        await updateConnectionStatus({
          connectionType: "banking",
          connected: true,
        });
      } catch (error) {
        console.error("Failed to exchange token:", error);
      } finally {
        setIsExchanging(false);
        setLinkToken(null);
      }
    },
    [exchangePublicToken, updateConnectionStatus],
  );

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: onPlaidSuccess,
    onExit: () => setLinkToken(null),
  });

  // Auto-open Plaid when link token is ready
  if (linkToken && ready) {
    open();
  }

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
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 mb-4">
            <Building2 className="w-8 h-8 text-emerald-500" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">
            Connect Your Bank Accounts
          </h2>
          <p className="text-white/50">
            See your checking, savings, and credit cards in one view
          </p>
        </motion.div>

        {/* Benefits */}
        <motion.div className="mb-8 space-y-3" variants={itemVariants}>
          <BenefitItem text="Automatic balance updates" delay={0.1} />
          <BenefitItem
            text="Transaction history & categorization"
            delay={0.2}
          />
          <BenefitItem text="Multi-currency support" delay={0.3} />
        </motion.div>

        {/* Connected Accounts */}
        {hasConnections && (
          <motion.div className="mb-6" variants={itemVariants}>
            <h3 className="text-sm font-medium text-white/60 mb-3">
              Connected Accounts
            </h3>
            <div className="space-y-3">
              {plaidAccounts.map((account) => (
                <ConnectionCard
                  key={account._id}
                  type="bank"
                  name={account.name}
                  accountCount={1}
                  status="connected"
                  icon={<Building2 className="w-5 h-5 text-emerald-500" />}
                />
              ))}
            </div>
          </motion.div>
        )}

        {/* Connect Button Card */}
        <OnboardingCard glow="none" className="mb-6">
          <OnboardingCardContent>
            <div className="flex flex-col items-center text-center py-4">
              {/* Illustration placeholder */}
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 flex items-center justify-center mb-6 border border-emerald-500/20">
                <Building2 className="w-12 h-12 text-emerald-500/60" />
              </div>

              <OnboardingButton
                onClick={handleCreateLink}
                isLoading={isCreatingLink || isExchanging}
                variant="secondary"
                icon={
                  isExchanging ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Plus className="w-5 h-5" />
                  )
                }
                className="w-full"
              >
                {isExchanging
                  ? "Connecting..."
                  : hasConnections
                    ? "Add Another Bank"
                    : "Connect Bank Account"}
              </OnboardingButton>
            </div>
          </OnboardingCardContent>
        </OnboardingCard>

        {/* Security Badge */}
        <motion.div
          className="flex items-center justify-center gap-2 text-white/40 text-sm mb-8"
          variants={itemVariants}
        >
          <Shield className="w-4 h-4" />
          <span>Bank-level encryption • Read-only access</span>
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
            {hasConnections ? "Continue" : "Continue Without Banking"}
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
