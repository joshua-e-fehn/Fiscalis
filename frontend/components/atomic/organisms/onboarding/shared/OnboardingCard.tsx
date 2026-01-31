"use client";

import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface OnboardingCardProps {
  children: React.ReactNode;
  className?: string;
  glow?: "gold" | "blue" | "none";
  animate?: boolean;
}

export function OnboardingCard({
  children,
  className,
  glow = "none",
  animate = true,
}: OnboardingCardProps) {
  const glowStyles = {
    gold: "before:bg-gradient-to-r before:from-[#D4AF37]/20 before:to-[#D4AF37]/5",
    blue: "before:bg-gradient-to-r before:from-[#3B82F6]/20 before:to-[#3B82F6]/5",
    none: "",
  };

  const Wrapper = animate ? motion.div : "div";
  const wrapperProps = animate
    ? {
        initial: { opacity: 0, y: 20 },
        animate: { opacity: 1, y: 0 },
        transition: { type: "spring", stiffness: 300, damping: 24 },
      }
    : {};

  return (
    <Wrapper
      className={cn(
        "relative rounded-2xl",
        "bg-white/[0.03] backdrop-blur-xl",
        "border border-white/[0.08]",
        "shadow-xl shadow-black/20",
        glow !== "none" &&
          "before:absolute before:inset-0 before:rounded-2xl before:-z-10 before:blur-xl",
        glowStyles[glow],
        className,
      )}
      {...wrapperProps}
    >
      {children}
    </Wrapper>
  );
}

interface OnboardingCardHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function OnboardingCardHeader({
  children,
  className,
}: OnboardingCardHeaderProps) {
  return (
    <div className={cn("px-6 py-5 border-b border-white/[0.05]", className)}>
      {children}
    </div>
  );
}

interface OnboardingCardContentProps {
  children: React.ReactNode;
  className?: string;
}

export function OnboardingCardContent({
  children,
  className,
}: OnboardingCardContentProps) {
  return <div className={cn("px-6 py-5", className)}>{children}</div>;
}

interface OnboardingCardFooterProps {
  children: React.ReactNode;
  className?: string;
}

export function OnboardingCardFooter({
  children,
  className,
}: OnboardingCardFooterProps) {
  return (
    <div
      className={cn(
        "px-6 py-4 border-t border-white/[0.05]",
        "bg-white/[0.01]",
        className,
      )}
    >
      {children}
    </div>
  );
}
