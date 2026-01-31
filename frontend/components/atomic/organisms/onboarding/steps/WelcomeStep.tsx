"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { PieChart, Wallet, TrendingUp, ArrowRight } from "lucide-react";
import { OnboardingButton } from "../shared/OnboardingButton";
import { FeatureItem } from "../shared/FeatureItem";
import { containerVariants, itemVariants } from "@/lib/types/onboarding";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center px-4 py-8">
      <motion.div
        className="max-w-2xl mx-auto text-center"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >
        {/* Logo/Brand */}
        <motion.div className="mb-8" variants={itemVariants}>
          <motion.div
            className="inline-flex items-center justify-center w-28 h-28 rounded-2xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/30 mb-6 overflow-hidden p-5"
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 20,
              delay: 0.2,
            }}
          >
            <Image
              src="/fiscalisIcon.svg"
              alt="Fiscalis Logo"
              width={64}
              height={64}
              className="object-contain"
              priority
            />
          </motion.div>
          <motion.h1
            className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Welcome to{" "}
            <span className="bg-gradient-to-r from-[#D4AF37] to-[#F4CF57] bg-clip-text text-transparent">
              Fiscalis
            </span>
          </motion.h1>
          <motion.p
            className="text-xl text-white/60 max-w-md mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            Your complete wealth picture, in one place.
          </motion.p>
        </motion.div>

        {/* Value Props */}
        <motion.div
          className="grid md:grid-cols-3 gap-6 mb-12"
          variants={containerVariants}
        >
          <ValuePropCard
            icon={PieChart}
            title="Track Everything"
            description="Stocks, crypto, real estate, cash, precious metals — all in one view"
            delay={0.5}
          />
          <ValuePropCard
            icon={Wallet}
            title="Know Your Debts"
            description="Loans, mortgages, credit cards at a glance"
            delay={0.6}
          />
          <ValuePropCard
            icon={TrendingUp}
            title="True Net Worth"
            description="Assets minus liabilities, updated in real-time"
            delay={0.7}
          />
        </motion.div>

        {/* Dashboard Preview Placeholder */}
        <motion.div
          className="relative mb-12 rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.5 }}
        >
          {/* Placeholder for dashboard mockup image */}
          <div className="aspect-video bg-gradient-to-br from-white/[0.03] to-white/[0.01] rounded-2xl border border-white/[0.08] flex items-center justify-center">
            <div className="text-center">
              <DashboardMockup />
            </div>
          </div>
          {/* Glow effect */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent pointer-events-none" />
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1 }}
        >
          <OnboardingButton
            onClick={onNext}
            size="lg"
            icon={<ArrowRight className="w-5 h-5" />}
          >
            Let&apos;s Get Started
          </OnboardingButton>
        </motion.div>
      </motion.div>
    </div>
  );
}

// Value Proposition Card Component
interface ValuePropCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  delay?: number;
}

function ValuePropCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: ValuePropCardProps) {
  return (
    <motion.div
      className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.05] hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      whileHover={{ y: -5 }}
    >
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#D4AF37]/20 to-[#3B82F6]/20 flex items-center justify-center mb-4 mx-auto">
        <Icon className="w-6 h-6 text-[#D4AF37]" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/50">{description}</p>
    </motion.div>
  );
}

// Simple Dashboard Mockup Component
function DashboardMockup() {
  return (
    <div className="w-full max-w-lg mx-auto p-6">
      {/* Net Worth Header */}
      <div className="text-left mb-6">
        <p className="text-white/40 text-sm mb-1">Total Net Worth</p>
        <motion.p
          className="text-3xl font-bold text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          €247,832.00
        </motion.p>
        <motion.span
          className="text-emerald-500 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
        >
          +12.4% this year
        </motion.span>
      </div>

      {/* Asset Bars */}
      <div className="space-y-3">
        <MockupBar label="Equities" value={45} color="#3B82F6" delay={1.5} />
        <MockupBar label="Crypto" value={25} color="#D4AF37" delay={1.6} />
        <MockupBar label="Cash" value={15} color="#22c55e" delay={1.7} />
        <MockupBar label="Real Estate" value={10} color="#8B5CF6" delay={1.8} />
        <MockupBar label="Liabilities" value={-5} color="#EF4444" delay={1.9} />
      </div>
    </div>
  );
}

interface MockupBarProps {
  label: string;
  value: number;
  color: string;
  delay: number;
}

function MockupBar({ label, value, color, delay }: MockupBarProps) {
  const isNegative = value < 0;
  const absValue = Math.abs(value);

  return (
    <div className="flex items-center gap-3">
      <span className="text-white/50 text-xs w-20 text-left">{label}</span>
      <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${absValue}%` }}
          transition={{ delay, duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span
        className={`text-xs w-10 text-right ${
          isNegative ? "text-red-400" : "text-white/60"
        }`}
      >
        {isNegative ? "-" : ""}
        {absValue}%
      </span>
    </div>
  );
}
