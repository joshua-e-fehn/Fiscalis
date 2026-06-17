"use client";

import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import {
  PieChart,
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
  Sparkles,
} from "lucide-react";
import { SignInButton, SignUpButton, SignedOut, SignedIn } from "@clerk/nextjs";
import { Button } from "@/components/ui/shadcn/button";

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

export default function HomePage() {
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
                Features
              </a>
              <a
                href="#how-it-works"
                className="text-white/60 hover:text-white transition-colors text-sm"
              >
                How it Works
              </a>
              <a
                href="#security"
                className="text-white/60 hover:text-white transition-colors text-sm"
              >
                Security
              </a>
            </div>

            {/* Auth Buttons */}
            <div className="flex items-center gap-3">
              <SignedOut>
                <SignInButton>
                  <Button
                    variant="ghost"
                    className="text-white/70 hover:text-white hover:bg-white/5"
                  >
                    Sign in
                  </Button>
                </SignInButton>
                <SignUpButton>
                  <Button className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-medium">
                    Get Started
                  </Button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard">
                  <Button className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-medium">
                    Dashboard
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
                alt="Fiscalis Logo"
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
                Your wealth, simplified
              </span>
            </motion.div>

            {/* Headline */}
            <motion.h1
              className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white mb-6 tracking-tight"
              variants={itemVariants}
            >
              Your Complete{" "}
              <span className="bg-gradient-to-r from-[#D4AF37] to-[#F4CF57] bg-clip-text text-transparent">
                Wealth Picture
              </span>
              <br />
              In One Place
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              className="text-xl text-white/50 max-w-2xl mx-auto mb-4"
              variants={itemVariants}
            >
              Track all your investments, assets, and liabilities. Know your
              true net worth with real-time updates across stocks, crypto, real
              estate, and more.
            </motion.p>

            {/* Tagline */}
            <motion.p
              className="text-lg text-white/30 mb-10"
              variants={itemVariants}
            >
              Think Finanzguru, but for your entire net worth.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div
              className="flex flex-col sm:flex-row items-center justify-center gap-4"
              variants={itemVariants}
            >
              <SignedOut>
                <SignUpButton>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-semibold px-8 py-6 text-lg"
                  >
                    Start For Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </SignUpButton>
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
                    Go to Dashboard
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
                <span>Bank-level security</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span>Real-time sync</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-4 h-4" />
                <span>Multi-currency</span>
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
              Everything You Need to{" "}
              <span className="bg-gradient-to-r from-[#D4AF37] to-[#F4CF57] bg-clip-text text-transparent">
                Master Your Wealth
              </span>
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              From bank accounts to crypto wallets, track all your assets in one
              unified dashboard.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <FeatureCard
              icon={Building2}
              title="Bank Accounts"
              description="Connect your bank accounts securely via Plaid. Track checking, savings, and credit cards."
              color="emerald"
              delay={0}
            />
            <FeatureCard
              icon={LineChart}
              title="Investment Portfolios"
              description="Import stocks, ETFs, bonds, and mutual funds from major brokerages automatically."
              color="blue"
              delay={0.1}
            />
            <FeatureCard
              icon={Bitcoin}
              title="Cryptocurrency"
              description="Track your crypto across exchanges and wallets. Support for 100+ coins and tokens."
              color="gold"
              delay={0.2}
            />
            <FeatureCard
              icon={PieChart}
              title="Real Estate"
              description="Add properties with automatic valuation estimates. Track rental income and expenses."
              color="purple"
              delay={0.3}
            />
            <FeatureCard
              icon={Wallet}
              title="Debts & Liabilities"
              description="Monitor loans, mortgages, and credit cards. See your true net worth."
              color="red"
              delay={0.4}
            />
            <FeatureCard
              icon={TrendingUp}
              title="Net Worth Tracking"
              description="Watch your wealth grow over time with beautiful charts and insights."
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
              Get Started in{" "}
              <span className="bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] bg-clip-text text-transparent">
                Minutes
              </span>
            </h2>
            <p className="text-lg text-white/50 max-w-2xl mx-auto">
              Three simple steps to see your complete financial picture.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-8">
            <StepCard
              number={1}
              title="Create Your Account"
              description="Sign up in seconds with your email or social login. No credit card required."
              delay={0}
            />
            <StepCard
              number={2}
              title="Connect Your Accounts"
              description="Securely link your banks, brokers, and crypto exchanges. Read-only access only."
              delay={0.1}
            />
            <StepCard
              number={3}
              title="See Your Net Worth"
              description="Watch your complete wealth picture come together in real-time."
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
                  Security by design
                </span>
              </div>
              <h2 className="text-4xl font-bold text-white mb-6">
                Your Data is{" "}
                <span className="bg-gradient-to-r from-emerald-400 to-emerald-600 bg-clip-text text-transparent">
                  Safe With Us
                </span>
              </h2>
              <p className="text-lg text-white/50 mb-8">
                We never see your bank credentials. Your sensitive data is
                encrypted with military-grade encryption and we only use
                read-only connections.
              </p>
              <ul className="space-y-4">
                <SecurityFeature text="AES-256-GCM encryption for all sensitive tokens" />
                <SecurityFeature text="Read-only access — we can never move your money" />
                <SecurityFeature text="Your bank credentials never touch our servers" />
                <SecurityFeature text="Trusted providers: Plaid, SnapTrade, Bitpanda" />
                <SecurityFeature text="Your data is yours — we never sell it" />
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
                Ready to Take Control of{" "}
                <span className="bg-gradient-to-r from-[#D4AF37] to-[#F4CF57] bg-clip-text text-transparent">
                  Your Wealth?
                </span>
              </h2>
              <p className="text-lg text-white/50 mb-10 max-w-2xl mx-auto">
                Join thousands of users who have already discovered the power of
                unified wealth management.
              </p>
              <SignedOut>
                <SignUpButton>
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-semibold px-10 py-6 text-lg"
                  >
                    Get Started For Free
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </SignUpButton>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard">
                  <Button
                    size="lg"
                    className="bg-gradient-to-r from-[#D4AF37] to-[#B8962E] hover:from-[#E5C048] hover:to-[#D4AF37] text-black font-semibold px-10 py-6 text-lg"
                  >
                    Go to Dashboard
                    <ArrowRight className="w-5 h-5 ml-2" />
                  </Button>
                </Link>
              </SignedIn>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative py-12 px-4 border-t border-white/[0.05]">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#D4AF37]/20 to-[#D4AF37]/5 border border-[#D4AF37]/30 flex items-center justify-center p-1.5">
                <Image
                  src="/fiscalisIcon.svg"
                  alt="Fiscalis"
                  width={28}
                  height={28}
                  className="object-contain"
                />
              </div>
              <span className="text-lg font-bold text-white">Fiscalis</span>
            </div>

            {/* Links */}
            <div className="flex items-center gap-8 text-sm text-white/40">
              <a href="#" className="hover:text-white transition-colors">
                Privacy
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Terms
              </a>
              <a href="#" className="hover:text-white transition-colors">
                Contact
              </a>
            </div>

            {/* Copyright */}
            <p className="text-sm text-white/30">
              © {new Date().getFullYear()} Fiscalis. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
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

// Dashboard Mockup Component
function DashboardMockup() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/40 text-sm">Total Net Worth</p>
          <p className="text-4xl font-bold text-white">€247,832.00</p>
          <p className="text-emerald-500 text-sm">+12.4% this year</p>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 text-sm font-medium">
            5 Banks
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#3B82F6]/10 text-[#3B82F6] text-sm font-medium">
            2 Brokers
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-[#D4AF37]/10 text-[#D4AF37] text-sm font-medium">
            3 Wallets
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
        <AssetItem
          label="Equities"
          value="€112,500"
          percent={45}
          color="#3B82F6"
        />
        <AssetItem
          label="Crypto"
          value="€62,000"
          percent={25}
          color="#D4AF37"
        />
        <AssetItem label="Cash" value="€37,200" percent={15} color="#22c55e" />
        <AssetItem
          label="Real Estate"
          value="€24,800"
          percent={10}
          color="#8B5CF6"
        />
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
      <p className="text-white/30 text-xs">{percent}%</p>
    </div>
  );
}
