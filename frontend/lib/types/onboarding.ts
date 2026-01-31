// ═══════════════════════════════════════════════════════════════
// ONBOARDING TYPES
// ═══════════════════════════════════════════════════════════════

export enum OnboardingStep {
  WELCOME = 1,
  PROFILE = 2,
  BANKING = 3,
  BROKERS = 4,
  CRYPTO = 5,
  COMPLETION = 6,
}

export const TOTAL_STEPS = 6;

export const STEP_LABELS: Record<OnboardingStep, string> = {
  [OnboardingStep.WELCOME]: "Welcome",
  [OnboardingStep.PROFILE]: "Profile",
  [OnboardingStep.BANKING]: "Banking",
  [OnboardingStep.BROKERS]: "Brokers",
  [OnboardingStep.CRYPTO]: "Crypto",
  [OnboardingStep.COMPLETION]: "Complete",
};

export interface OnboardingProgress {
  _id: string;
  userId: string;
  currentStep: number;
  completedSteps: number[];
  skippedSteps: number[];
  profileCompleted: boolean;
  bankingConnected: boolean;
  brokersConnected: boolean;
  cryptoConnected: boolean;
  onboardingCompleted: boolean;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface OnboardingState {
  currentStep: OnboardingStep;
  isLoading: boolean;
  progress: OnboardingProgress | null;
}

export interface ProfileFormData {
  displayName: string;
  defaultCurrency: Currency;
  language: Language;
  theme: Theme;
}

export type Currency = "EUR" | "USD" | "GBP" | "CHF";
export type Language = "en" | "de";
export type Theme = "light" | "dark" | "system";

export const CURRENCIES: { value: Currency; label: string; flag: string }[] = [
  { value: "EUR", label: "Euro (€)", flag: "🇪🇺" },
  { value: "USD", label: "US Dollar ($)", flag: "🇺🇸" },
  { value: "GBP", label: "British Pound (£)", flag: "🇬🇧" },
  { value: "CHF", label: "Swiss Franc (CHF)", flag: "🇨🇭" },
];

export const LANGUAGES: { value: Language; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
];

export interface ConnectionStatus {
  type: "banking" | "broker" | "crypto";
  isConnected: boolean;
  accountCount: number;
  lastSyncAt?: number;
}

// Animation variants for Framer Motion
export const pageVariants = {
  initial: { opacity: 0, x: 50 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -50 },
};

export const pageTransition = {
  type: "spring" as const,
  stiffness: 300,
  damping: 30,
};

export const containerVariants = {
  animate: {
    transition: {
      staggerChildren: 0.08,
    },
  },
};

export const itemVariants = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
};

export const fadeInVariants = {
  initial: { opacity: 0 },
  animate: {
    opacity: 1,
    transition: { duration: 0.5 },
  },
};

export const scaleInVariants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 300,
      damping: 24,
    },
  },
};
