"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import Image from "next/image";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  Shield,
  Zap,
  Globe2,
  ArrowRight,
  Building2,
  LineChart,
  Bitcoin,
  CheckCircle2,
  Gem,
  Sparkles,
} from "lucide-react";
import { SignInButton, SignedOut, SignedIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/shadcn/button";
import { LanguageToggle } from "@/components/i18n/LanguageToggle";
import { formatCurrency, formatPercent } from "@/lib/utils/currency";
import { SiteFooter } from "@/components/atomic/organisms/siteFooter";

// Animation variants
const containerVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const fadeInUp = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-100px" },
  transition: { duration: 0.6, ease: "easeOut" },
};

type RichTag = (chunks: React.ReactNode) => React.ReactNode;

/** A t.rich tag that renders its text in a gradient. */
function gradient(classes: string): RichTag {
  return function GradientText(chunks) {
    return (
      <span
        className={`bg-gradient-to-r ${classes} bg-clip-text text-transparent`}
      >
        {chunks}
      </span>
    );
  };
}

const goldHighlight = gradient("from-[#D4AF37] to-[#F4CF57]");

export default function HomePage() {
  const t = useTranslations("landing");
  return (
    <div className="min-h-screen bg-[#050505] overflow-x-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-[#D4AF37]/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-[#3B82F6]/5 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-[#050505]/80 backdrop-blur-xl border-b border-white/[0.05]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/30 flex items-center justify-center p-1.5">
                <Image
                  src="/fiscalisIcon.svg"
                  alt="Fiscalis"
                  width={28}
                  height={28}
                  className="object-contain"
                />
              </div>
              <span className="text-xl font-bold text-white">Fiscalis</span>
            </Link>

            {/* Nav Links */}
            <div className="hidden md:flex items-center gap-8">
              <a
                href="#features"
                className="text-white/60 hover:text-white transition-colors text-sm"
              >
                {t("nav.features")}
              </a>
              <a
                href="#how-it-works"
                className="text-white/60 hover:text-white transition-colors text-sm"
              >
                {t("nav.howItWorks")}
              </a>
              <a
                href="#security"
                className="text-white/60 hover:text-white transition-colors text-sm"
              >
                {t("nav.security")}
              </a>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-3">
              <SignedOut>
                <LanguageToggle />
                <SignInButton>
                  <Button
                    variant="ghost"
                    className="text-white/70 hover:text-white hover:bg-white/5"
                  >
                    {t("nav.signIn")}
                  </Button>
                </SignInButton>
                {/* Sign-up is waitlist-only (ENG-226) */}
                <Link href="/waitlist">
                  <Button className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-medium">
                    {t("nav.joinWaitlist")}
                  </Button>
                </Link>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard">
                  <Button className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-medium">
                    {t("nav.dashboard")}
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              </SignedIn>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div
            className="text-center max-w-4xl mx-auto flex flex-col items-center"
            variants={containerVariants}
            initial="initial"
            animate="animate"
          >
            {/* Logo */}
            <motion.div
              className="flex items-center justify-center w-28 h-28 rounded-3xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/30 mb-6 p-5"
              variants={itemVariants}
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: "spring", stiffness: 300 }}
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

            {/* Badge */}
            <motion.div
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.03] border border-white/[0.08] mb-8"
              variants={itemVariants}
            >
              <Sparkles className="w-4 h-4 text-[#D4AF37]" />
              <span className="text-sm text-white/60">
                {t("hero.badge")}
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight"
              variants={itemVariants}
            >
              {t.rich("hero.headline", {
                highlight: goldHighlight,
                br: () => <br />,
              })}
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              className="text-xl text-white/50 max-w-2xl mx-auto mb-4"
              variants={itemVariants}
            >
              {t("hero.subheadline")}
            </motion.p>

            {/* Tagline */}
            <motion.p
              className="text-lg text-white/30 mb-10"
              variants={itemVariants}
            >
              {t("hero.tagline")}
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              variants={itemVariants}
            >
              <SignedOut>
                <Link href="/waitlist">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-semibold px-8 py-6 text-lg"
                  >
                    {t("nav.joinWaitlist")}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
                {/* TODO: Add demo video
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/5 px-8 py-6 text-lg"
                >
                  Watch Demo
                </Button>
                */}
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-semibold px-8 py-6 text-lg"
                  >
                    {t("nav.goToDashboard")}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </SignedIn>
            </motion.div>

            {/* Trust Indicators */}
            <motion.div
              className="flex items-center justify-center gap-8 mt-12 text-white/30 text-sm"
              variants={itemVariants}
            >
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4" />
                <span>{t("trust.readOnly")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span>{t("trust.dailySync")}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4" />
                <span>{t("trust.multiCurrency")}</span>
              </div>
            </motion.div>
          </motion.div>

          {/* Dashboard Preview */}
          <motion.div
            className="relative mt-20 max-w-5xl mx-auto"
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent z-10 pointer-events-none" />
            <div className="rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-8 backdrop-blur-sm">
              <DashboardMockup />
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="relative py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-16" {...fadeInUp}>
            <h2 className="text-4xl font-bold text-white mb-4">
              {t.rich("features.headline", { highlight: goldHighlight })}
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              {t("features.subheadline")}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Building2}
              title={t("features.banksTitle")}
              description={t("features.banksDescription")}
              color="emerald"
              delay={0}
            />
            <FeatureCard
              icon={LineChart}
              title={t("features.investmentsTitle")}
              description={t("features.investmentsDescription")}
              color="blue"
              delay={0.1}
            />
            <FeatureCard
              icon={Bitcoin}
              title={t("features.cryptoTitle")}
              description={t("features.cryptoDescription")}
              color="gold"
              delay={0.2}
            />
            <FeatureCard
              icon={Gem}
              title={t("features.metalsTitle")}
              description={t("features.metalsDescription")}
              color="purple"
              delay={0.3}
            />
            <FeatureCard
              icon={Wallet}
              title={t("features.liabilitiesTitle")}
              description={t("features.liabilitiesDescription")}
              color="red"
              delay={0.4}
            />
            <FeatureCard
              icon={TrendingUp}
              title={t("features.netWorthTitle")}
              description={t("features.netWorthDescription")}
              color="cyan"
              delay={0.5}
            />
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section
        id="how-it-works"
        className="relative py-24 px-4 bg-white/[0.01]"
      >
        <div className="max-w-7xl mx-auto">
          <motion.div className="text-center mb-16" {...fadeInUp}>
            <h2 className="text-4xl font-bold text-white mb-4">
              {t.rich("steps.headline", {
                highlight: gradient("from-[#3B82F6] to-[#60A5FA]"),
              })}
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              {t("steps.subheadline")}
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number={1}
              title={t("steps.createTitle")}
              description={t("steps.createDescription")}
              delay={0}
            />
            <StepCard
              number={2}
              title={t("steps.connectTitle")}
              description={t("steps.connectDescription")}
              delay={0.1}
            />
            <StepCard
              number={3}
              title={t("steps.netWorthTitle")}
              description={t("steps.netWorthDescription")}
              delay={0.2}
            />
          </div>
        </div>
      </section>

      {/* Security Section */}
      <section id="security" className="relative py-24 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <motion.div {...fadeInUp}>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-6">
                <Shield className="w-4 h-4 text-emerald-500" />
                <span className="text-sm text-emerald-500">
                  {t("security.badge")}
                </span>
              </div>
              <h2 className="text-4xl font-bold text-white mb-6">
                {t.rich("security.headline", {
                  highlight: gradient("from-emerald-400 to-emerald-600"),
                })}
              </h2>
              <p className="text-lg text-white/50 mb-8">
                {t("security.description")}
              </p>
              <ul className="space-y-4">
                <SecurityFeature text={t("security.encryption")} />
                <SecurityFeature text={t("security.readOnly")} />
                <SecurityFeature text={t("security.credentials")} />
                <SecurityFeature text={t("security.providers")} />
                <SecurityFeature text={t("security.ownership")} />
              </ul>
            </motion.div>

            <motion.div
              className="relative"
              initial={{ opacity: 0, x: 40 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 to-[#3B82F6]/20 rounded-3xl blur-3xl" />
              <div className="relative rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-8">
                <div className="flex items-center justify-center h-64">
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 rounded-full blur-2xl animate-pulse" />
                    <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 flex items-center justify-center">
                      <Shield className="w-16 h-16 text-emerald-500" />
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-24 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            className="relative rounded-3xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] p-12 md:p-16 overflow-hidden"
            {...fadeInUp}
          >
            {/* Background glow */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[400px] h-[200px] bg-[#D4AF37]/10 rounded-full blur-[80px]" />

            <div className="relative z-10">
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-6">
                {t.rich("cta.headline", { highlight: goldHighlight })}
              </h2>
              <p className="text-lg text-white/50 mb-10 max-w-2xl mx-auto">
                {t("cta.description")}
              </p>
              <SignedOut>
                <Link href="/waitlist">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-semibold px-10 py-6 text-lg"
                  >
                    {t("nav.joinWaitlist")}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-semibold px-10 py-6 text-lg"
                  >
                    {t("nav.goToDashboard")}
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </SignedIn>
            </div>
          </motion.div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

// Feature Card Component
function FeatureCard({
  icon: Icon,
  title,
  description,
  color,
  delay,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  color: "emerald" | "blue" | "gold" | "purple" | "red" | "cyan";
  delay: number;
}) {
  const colorStyles = {
    emerald: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/20",
      text: "text-emerald-500",
      glow: "group-hover:shadow-emerald-500/20",
    },
    blue: {
      bg: "bg-[#3B82F6]/10",
      border: "border-[#3B82F6]/20",
      text: "text-[#3B82F6]",
      glow: "group-hover:shadow-[#3B82F6]/20",
    },
    gold: {
      bg: "bg-[#D4AF37]/10",
      border: "border-[#D4AF37]/20",
      text: "text-[#D4AF37]",
      glow: "group-hover:shadow-[#D4AF37]/20",
    },
    purple: {
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
      text: "text-purple-500",
      glow: "group-hover:shadow-purple-500/20",
    },
    red: {
      bg: "bg-red-500/10",
      border: "border-red-500/20",
      text: "text-red-500",
      glow: "group-hover:shadow-red-500/20",
    },
    cyan: {
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      text: "text-cyan-500",
      glow: "group-hover:shadow-cyan-500/20",
    },
  };

  const styles = colorStyles[color];

  return (
    <motion.div
      className={`group relative p-6 rounded-2xl border border-white/[0.08] bg-gradient-to-br from-white/[0.03] to-white/[0.01] transition-all duration-300 hover:border-white/[0.15] hover:shadow-lg ${styles.glow}`}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
    >
      <div
        className={`w-12 h-12 rounded-xl ${styles.bg} ${styles.border} border flex items-center justify-center mb-4`}
      >
        <Icon className={`w-6 h-6 ${styles.text}`} />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
      <p className="text-white/50">{description}</p>
    </motion.div>
  );
}

// Step Card Component
function StepCard({
  number,
  title,
  description,
  delay,
}: {
  number: number;
  title: string;
  description: string;
  delay: number;
}) {
  return (
    <motion.div
      className="relative text-center p-8"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5 }}
    >
      {/* Number */}
      <div className="relative inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-[#3B82F6]/20 to-[#3B82F6]/5 border border-[#3B82F6]/30 mb-6">
        <span className="text-2xl font-bold text-[#3B82F6]">{number}</span>
      </div>
      <h3 className="text-xl font-semibold text-white mb-3">{title}</h3>
      <p className="text-white/50">{description}</p>
    </motion.div>
  );
}

// Security Feature Component
function SecurityFeature({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3">
      <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
      <span className="text-white/70">{text}</span>
    </li>
  );
}

const MOCKUP_ASSETS = [
  { key: "equities", value: 112500, percent: 45, color: "#3B82F6" },
  { key: "crypto", value: 62000, percent: 25, color: "#D4AF37" },
  { key: "cash", value: 37200, percent: 15, color: "#22c55e" },
  { key: "realEstate", value: 24800, percent: 10, color: "#8B5CF6" },
] as const;

// Dashboard Mockup Component
function DashboardMockup() {
  const t = useTranslations("landing.mockup");
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/40 text-sm">{t("totalNetWorth")}</p>
          <p className="text-4xl font-bold text-white">
            {formatCurrency(247832, "EUR")}
          </p>
          <p className="text-emerald-500 text-sm">
            {t("yearChange", { change: formatPercent(12.4, true, 1) })}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-sm font-medium">
            {t("banks", { count: 5 })}
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#3B82F6]/10 text-[#3B82F6] text-sm font-medium">
            {t("brokers", { count: 2 })}
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] text-sm font-medium">
            {t("wallets", { count: 3 })}
          </div>
        </div>
      </div>

      {/* Chart placeholder */}
      <div className="h-48 rounded-xl bg-white/[0.02] border border-white/[0.05] flex items-end justify-between p-4 gap-2">
        {[40, 55, 45, 60, 50, 70, 65, 80, 75, 90, 85, 95].map((height, i) => (
          <div
            key={i}
            className="flex-1 bg-gradient-to-t from-[#D4AF37]/50 to-[#D4AF37]/20 rounded-t"
            style={{ height: `${height}%` }}
          />
        ))}
      </div>

      {/* Asset breakdown */}
      <div className="grid grid-cols-4 gap-4">
        {MOCKUP_ASSETS.map(({ key, value, percent, color }) => (
          <AssetItem
            key={key}
            label={t(key)}
            value={formatCurrency(value, "EUR", { fractionDigits: 0 })}
            percent={percent}
            color={color}
          />
        ))}
      </div>
    </div>
  );
}

function AssetItem({
  label,
  value,
  percent,
  color,
}: {
  label: string;
  value: string;
  percent: number;
  color: string;
}) {
  return (
    <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05]">
      <div className="flex items-center gap-2 mb-2">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-white/50 text-xs">{label}</span>
      </div>
      <p className="text-white font-semibold">{value}</p>
      <p className="text-white/30 text-xs">{formatPercent(percent, false, 0)}</p>
    </div>
  );
}
