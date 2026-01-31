"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import {
  OnboardingStep,
  STEP_LABELS,
  TOTAL_STEPS,
} from "@/lib/types/onboarding";

interface OnboardingProgressProps {
  currentStep: OnboardingStep;
  completedSteps: number[];
  className?: string;
  showLabels?: boolean;
  onStepClick?: (step: OnboardingStep) => void;
}

export function OnboardingProgress({
  currentStep,
  completedSteps,
  className,
  showLabels = true,
  onStepClick,
}: OnboardingProgressProps) {
  const steps = Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1);

  const handleStepClick = (step: number) => {
    if (onStepClick) {
      onStepClick(step as OnboardingStep);
    }
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Progress bar */}
      <div className="relative flex items-center justify-between">
        {/* Background line */}
        <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-white/10 -translate-y-1/2" />

        {/* Active line */}
        <motion.div
          className="absolute left-0 top-1/2 h-0.5 bg-gradient-to-r from-[#D4AF37] to-[#3B82F6] -translate-y-1/2"
          initial={{ width: "0%" }}
          animate={{
            width: `${((currentStep - 1) / (TOTAL_STEPS - 1)) * 100}%`,
          }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />

        {/* Step indicators */}
        {steps.map((step) => {
          const isCompleted = completedSteps.includes(step);
          const isCurrent = step === currentStep;
          const isPast = step < currentStep;
          const isClickable = !!onStepClick;

          return (
            <div
              key={step}
              className="relative z-10 flex flex-col items-center"
            >
              <motion.button
                type="button"
                onClick={() => handleStepClick(step)}
                disabled={!isClickable}
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center",
                  "border-2 transition-all duration-200",
                  isCompleted || isPast
                    ? "bg-gradient-to-r from-[#D4AF37] to-[#B8962E] border-[#D4AF37]"
                    : isCurrent
                      ? "bg-[#0a0a0f] border-[#D4AF37]"
                      : "bg-[#0a0a0f] border-white/20",
                  isClickable &&
                    "cursor-pointer hover:scale-110 hover:shadow-lg hover:shadow-[#D4AF37]/20",
                  !isClickable && "cursor-default",
                )}
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                whileHover={isClickable ? { scale: 1.1 } : undefined}
                whileTap={isClickable ? { scale: 0.95 } : undefined}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 20,
                  delay: step * 0.05,
                }}
              >
                {isCompleted || isPast ? (
                  <Check className="w-5 h-5 text-black" />
                ) : (
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      isCurrent ? "text-[#D4AF37]" : "text-white/40",
                    )}
                  >
                    {step}
                  </span>
                )}
              </motion.button>

              {/* Label */}
              {showLabels && (
                <motion.button
                  type="button"
                  onClick={() => handleStepClick(step)}
                  disabled={!isClickable}
                  className={cn(
                    "absolute -bottom-6 text-xs font-medium whitespace-nowrap",
                    isCurrent
                      ? "text-white"
                      : isCompleted || isPast
                        ? "text-white/60"
                        : "text-white/30",
                    isClickable && "cursor-pointer hover:text-white",
                  )}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: step * 0.05 + 0.2 }}
                >
                  {STEP_LABELS[step as OnboardingStep]}
                </motion.button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Compact version for mobile
interface OnboardingProgressCompactProps {
  currentStep: OnboardingStep;
  totalSteps?: number;
  className?: string;
}

export function OnboardingProgressCompact({
  currentStep,
  totalSteps = TOTAL_STEPS,
  className,
}: OnboardingProgressCompactProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-white/60">
          Step {currentStep} of {totalSteps}
        </span>
        <span className="text-sm font-medium text-white">
          {STEP_LABELS[currentStep as OnboardingStep]}
        </span>
      </div>
      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-[#D4AF37] to-[#3B82F6] rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        />
      </div>
    </div>
  );
}
