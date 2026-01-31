"use client";

import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { pageVariants, pageTransition } from "@/lib/types/onboarding";

interface OnboardingStepProps {
  children: React.ReactNode;
  stepKey: string | number;
  className?: string;
  direction?: "forward" | "backward";
}

export function OnboardingStep({
  children,
  stepKey,
  className,
  direction = "forward",
}: OnboardingStepProps) {
  const variants = {
    initial: {
      opacity: 0,
      x: direction === "forward" ? 50 : -50,
    },
    animate: {
      opacity: 1,
      x: 0,
    },
    exit: {
      opacity: 0,
      x: direction === "forward" ? -50 : 50,
    },
  };

  return (
    <motion.div
      key={stepKey}
      className={cn("w-full", className)}
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
}

interface OnboardingStepContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function OnboardingStepContainer({
  children,
  className,
}: OnboardingStepContainerProps) {
  return (
    <AnimatePresence mode="wait">
      <div className={cn("w-full", className)}>{children}</div>
    </AnimatePresence>
  );
}
