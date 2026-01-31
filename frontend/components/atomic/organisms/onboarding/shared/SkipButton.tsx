"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

interface SkipButtonProps {
  onClick: () => void;
  text?: string;
  className?: string;
  disabled?: boolean;
}

export function SkipButton({
  onClick,
  text = "Skip for now",
  className,
  disabled = false,
}: SkipButtonProps) {
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
      whileHover={{ x: 3 }}
      whileTap={{ scale: 0.98 }}
    >
      {text}
      <ChevronRight className="w-4 h-4" />
    </motion.button>
  );
}
