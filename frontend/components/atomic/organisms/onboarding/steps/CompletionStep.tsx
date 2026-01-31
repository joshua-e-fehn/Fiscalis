"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  PartyPopper,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Building2,
  LineChart,
  Bitcoin,
  Plus,
} from "lucide-react";
import { OnboardingButton } from "../shared/OnboardingButton";
import {
  OnboardingCard,
  OnboardingCardContent,
} from "../shared/OnboardingCard";
import { containerVariants, itemVariants } from "@/lib/types/onboarding";
import {
  useConnectionSummary,
  useCompleteOnboarding,
} from "@/hooks/convex/onboarding";

interface CompletionStepProps {
  onAddMore: () => void;
  onBack: () => void;
}

export function CompletionStep({ onAddMore, onBack }: CompletionStepProps) {
  const router = useRouter();
  const connectionSummary = useConnectionSummary();
  const completeOnboarding = useCompleteOnboarding();
  const [isNavigating, setIsNavigating] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Trigger confetti on mount
  useEffect(() => {
    setShowConfetti(true);
    // Mark onboarding as complete
    completeOnboarding();
  }, [completeOnboarding]);

  const handleGoToDashboard = () => {
    setIsNavigating(true);
    // Clear the session flag so they won't be redirected back
    sessionStorage.removeItem("onboarding_in_progress");
    router.push("/dashboard");
  };

  const totalConnections =
    (connectionSummary?.bankingCount || 0) +
    (connectionSummary?.brokerCount || 0) +
    (connectionSummary?.cryptoCount || 0);

  const hasAnyConnection = totalConnections > 0;

  return (
    <div className="flex flex-col items-center px-4 py-8 relative">
      {/* Confetti Effect */}
      {showConfetti && <ConfettiEffect />}

      <motion.div
        className="w-full max-w-lg mx-auto text-center"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >
        {/* Success Icon */}
        <motion.div
          className="mb-8"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.2,
          }}
        >
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border-2 border-[#D4AF37]/30">
            <PartyPopper className="w-12 h-12 text-[#D4AF37]" />
          </div>
        </motion.div>

        {/* Header */}
        <motion.div variants={itemVariants} className="mb-8">
          <h2 className="text-4xl font-bold text-white mb-3">
            You&apos;re All Set! 🎉
          </h2>
          <p className="text-lg text-white/50">
            Your wealth dashboard is ready to explore
          </p>
        </motion.div>

        {/* Connection Summary */}
        <OnboardingCard glow="gold" className="mb-8">
          <OnboardingCardContent>
            <h3 className="text-sm font-medium text-white/60 mb-4">
              {hasAnyConnection ? "What you've connected" : "Setup Summary"}
            </h3>

            <div className="space-y-4">
              <ConnectionSummaryItem
                icon={Building2}
                label="Bank Accounts"
                count={connectionSummary?.bankingCount || 0}
                color="emerald"
                delay={0.3}
              />
              <ConnectionSummaryItem
                icon={LineChart}
                label="Brokerage Accounts"
                count={connectionSummary?.brokerCount || 0}
                color="blue"
                delay={0.4}
              />
              <ConnectionSummaryItem
                icon={Bitcoin}
                label="Crypto Wallets"
                count={connectionSummary?.cryptoCount || 0}
                color="gold"
                delay={0.5}
              />
            </div>

            {!hasAnyConnection && (
              <motion.div
                className="mt-6 pt-4 border-t border-white/[0.05]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <p className="text-white/40 text-sm">
                  You can connect your accounts anytime in Settings
                </p>
              </motion.div>
            )}
          </OnboardingCardContent>
        </OnboardingCard>

        {/* Motivational Message */}
        {hasAnyConnection && (
          <motion.div className="mb-8 text-center" variants={itemVariants}>
            <p className="text-white/50 text-sm">
              Your accounts are syncing. Head to your dashboard to see your
              complete wealth picture.
            </p>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          className="flex flex-col items-center gap-4"
          variants={itemVariants}
        >
          <OnboardingButton
            onClick={handleGoToDashboard}
            isLoading={isNavigating}
            size="lg"
            className="w-full"
            icon={<ArrowRight className="w-5 h-5" />}
          >
            Go to Dashboard
          </OnboardingButton>

          <div className="flex items-center gap-4">
            <OnboardingButton
              onClick={onBack}
              variant="ghost"
              icon={<ArrowLeft className="w-4 h-4" />}
            >
              Go Back
            </OnboardingButton>

            {!hasAnyConnection && (
              <OnboardingButton
                onClick={onAddMore}
                variant="ghost"
                icon={<Plus className="w-4 h-4" />}
              >
                Add Accounts
              </OnboardingButton>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

interface ConnectionSummaryItemProps {
  icon: React.ElementType;
  label: string;
  count: number;
  color: "emerald" | "blue" | "gold";
  delay: number;
}

function ConnectionSummaryItem({
  icon: Icon,
  label,
  count,
  color,
  delay,
}: ConnectionSummaryItemProps) {
  const colorStyles = {
    emerald: {
      bg: "bg-emerald-500/10",
      text: "text-emerald-500",
      border: "border-emerald-500/20",
    },
    blue: {
      bg: "bg-[#3B82F6]/10",
      text: "text-[#3B82F6]",
      border: "border-[#3B82F6]/20",
    },
    gold: {
      bg: "bg-[#D4AF37]/10",
      text: "text-[#D4AF37]",
      border: "border-[#D4AF37]/20",
    },
  };

  const styles = colorStyles[color];

  return (
    <motion.div
      className="flex items-center justify-between"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay }}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-lg ${styles.bg} ${styles.border} border flex items-center justify-center`}
        >
          <Icon className={`w-5 h-5 ${styles.text}`} />
        </div>
        <span className="text-white/70">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {count > 0 ? (
          <>
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            <span className="text-white font-medium">{count}</span>
          </>
        ) : (
          <span className="text-white/30">Not connected</span>
        )}
      </div>
    </motion.div>
  );
}

function ConfettiEffect() {
  const [particles, setParticles] = useState<
    Array<{
      id: number;
      x: number;
      y: number;
      rotation: number;
      scale: number;
      color: string;
    }>
  >([]);

  useEffect(() => {
    const colors = ["#D4AF37", "#3B82F6", "#22c55e", "#ffffff"];
    const newParticles = Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      rotation: Math.random() * 360,
      scale: Math.random() * 0.5 + 0.5,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
    setParticles(newParticles);

    // Clean up confetti after animation
    const timeout = setTimeout(() => setParticles([]), 3000);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute w-3 h-3"
          style={{
            left: `${particle.x}%`,
            top: "-10%",
            backgroundColor: particle.color,
            borderRadius: Math.random() > 0.5 ? "50%" : "2px",
          }}
          initial={{
            y: 0,
            rotate: 0,
            scale: particle.scale,
            opacity: 1,
          }}
          animate={{
            y: "120vh",
            rotate: particle.rotation + 720,
            opacity: 0,
          }}
          transition={{
            duration: 3,
            ease: "easeOut",
            delay: Math.random() * 0.5,
          }}
        />
      ))}
    </div>
  );
}
