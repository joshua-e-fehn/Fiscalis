"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { PieChart, Wallet, TrendingUp, ArrowRight } from "lucide-react";
import { OnboardingButton } from "../shared/OnboardingButton";
import { containerVariants, itemVariants } from "@/lib/types/onboarding";
import { useCategoryLabels } from "@/lib/config/categoryUI";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";

interface WelcomeStepProps {
  onNext: () => void;
}

export function WelcomeStep({ onNext }: WelcomeStepProps) {
  const t = useTranslations("onboarding.welcome");
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
              alt={t("logoAlt")}
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
            {t.rich("title", {
              brand: (chunks) => (
                <span className="bg-gradient-to-r from-[#D4AF37] to-[#F4CF57] bg-clip-text text-transparent">
                  {chunks}
                </span>
              ),
            })}
          </motion.h1>
          <motion.p
            className="text-xl text-white/60 max-w-md mx-auto"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            {t("subtitle")}
          </motion.p>
        </motion.div>

        {/* Value Props */}
        <motion.div
          className="grid md:grid-cols-3 gap-6 mb-12"
          variants={containerVariants}
        >
          <ValuePropCard
            icon={PieChart}
            title={t("trackTitle")}
            description={t("trackDescription")}
            delay={0.5}
          />
          <ValuePropCard
            icon={Wallet}
            title={t("debtsTitle")}
            description={t("debtsDescription")}
            delay={0.6}
          />
          <ValuePropCard
            icon={TrendingUp}
            title={t("netWorthTitle")}
            description={t("netWorthDescription")}
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
            icon={<ArrowRight className="w-5 h-5 rtl:-scale-x-100" />}
          >
            {t("getStarted")}
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
  const t = useTranslations("onboarding.welcome");
  const { categoryName } = useCategoryLabels();
  return (
    <div className="w-full max-w-lg mx-auto p-6">
      {/* Net Worth Header */}
      <div className="text-start mb-6">
        <p className="text-white/40 text-sm mb-1">
          {t("mockupNetWorth")}
        </p>
        <motion.p
          className="text-3xl font-bold text-white"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          {formatCurrency(247832, "EUR")}
        </motion.p>
        <motion.span
          className="text-emerald-500 text-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
        >
          {t("mockupChange", { change: formatPercent(12.4, true, 1) })}
        </motion.span>
      </div>

      {/* Asset Bars */}
      <div className="space-y-3">
        <MockupBar
          label={categoryName("equities")}
          value={45}
          color="#3B82F6"
          delay={1.5}
        />
        <MockupBar
          label={categoryName("crypto")}
          value={25}
          color="#D4AF37"
          delay={1.6}
        />
        <MockupBar
          label={categoryName("cash")}
          value={15}
          color="#22c55e"
          delay={1.7}
        />
        <MockupBar
          label={categoryName("real-estate")}
          value={10}
          color="#8B5CF6"
          delay={1.8}
        />
        <MockupBar
          label={categoryName("liabilities")}
          value={-5}
          color="#EF4444"
          delay={1.9}
        />
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
      <span className="text-white/50 text-xs w-36 text-start truncate">
        {label}
      </span>
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
        className={`text-xs w-10 text-end ${
          isNegative ? "text-red-400" : "text-white/60"
        }`}
      >
        {isNegative ? "-" : ""}
        {absValue}%
      </span>
    </div>
  );
}
