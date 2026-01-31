"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { LucideIcon } from "lucide-react";

interface FeatureItemProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  iconColor?: "gold" | "blue" | "green" | "default";
  delay?: number;
}

export function FeatureItem({
  icon: Icon,
  title,
  description,
  iconColor = "default",
  delay = 0,
}: FeatureItemProps) {
  const iconColorStyles = {
    gold: "text-[#D4AF37] bg-[#D4AF37]/10",
    blue: "text-[#3B82F6] bg-[#3B82F6]/10",
    green: "text-emerald-500 bg-emerald-500/10",
    default: "text-white/70 bg-white/5",
  };

  return (
    <motion.div
      className="flex items-start gap-4"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 24,
        delay,
      }}
    >
      <div
        className={cn(
          "flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center",
          iconColorStyles[iconColor],
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 pt-1">
        <h3 className="text-white font-medium">{title}</h3>
        {description && (
          <p className="text-white/50 text-sm mt-1">{description}</p>
        )}
      </div>
    </motion.div>
  );
}

interface BenefitItemProps {
  text: string;
  delay?: number;
}

export function BenefitItem({ text, delay = 0 }: BenefitItemProps) {
  return (
    <motion.div
      className="flex items-center gap-3"
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        type: "spring",
        stiffness: 300,
        damping: 24,
        delay,
      }}
    >
      <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <svg
          className="w-3 h-3 text-emerald-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      </div>
      <span className="text-white/70 text-sm">{text}</span>
    </motion.div>
  );
}
