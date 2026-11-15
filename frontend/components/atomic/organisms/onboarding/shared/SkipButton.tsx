"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { useInlineSign } from "@/hooks/useInlineSign";
import { ChevronRight } from "lucide-react";

interface SkipButtonProps {
  onClick: () => void;
  text?: string;
  className?: string;
  disabled?: boolean;
}

export function SkipButton({
  onClick,
  text,
  className,
  disabled = false,
}: SkipButtonProps) {
  const t = useTranslations("onboarding.shared");
  const sign = useInlineSign();
  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1 text-sm text-white/40",
        "hover:text-white/60 transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className,
      )}
      whileHover={{ x: 3 * sign }}
      whileTap={{ scale: 0.98 }}
    >
      {text ?? t("skip")}
      <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
    </motion.button>
  );
}
