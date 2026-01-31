"use client";

import { forwardRef } from "react";
import { motion, HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

interface OnboardingButtonProps extends Omit<
  HTMLMotionProps<"button">,
  "children"
> {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "ghost";
  size?: "default" | "lg";
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const OnboardingButton = forwardRef<
  HTMLButtonElement,
  OnboardingButtonProps
>(
  (
    {
      children,
      variant = "primary",
      size = "default",
      isLoading = false,
      icon,
      className,
      disabled,
      ...props
    },
    ref,
  ) => {
    const variantStyles = {
      primary: cn(
        "bg-gradient-to-r from-[#D4AF37] to-[#B8962E]",
        "text-black font-semibold",
        "hover:from-[#E4BF47] hover:to-[#C8A63E]",
        "shadow-lg shadow-[#D4AF37]/20",
        "border border-[#D4AF37]/30",
      ),
      secondary: cn(
        "bg-white/[0.05]",
        "text-white font-medium",
        "hover:bg-white/[0.1]",
        "border border-white/[0.1]",
      ),
      ghost: cn(
        "bg-transparent",
        "text-white/70 font-medium",
        "hover:text-white hover:bg-white/[0.05]",
      ),
    };

    const sizeStyles = {
      default: "h-11 px-6 text-sm",
      lg: "h-14 px-8 text-base",
    };

    return (
      <motion.button
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center gap-2 rounded-xl",
          "transition-all duration-200",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4AF37]/50",
          variantStyles[variant],
          sizeStyles[size],
          className,
        )}
        disabled={disabled || isLoading}
        whileHover={{ scale: disabled || isLoading ? 1 : 1.02 }}
        whileTap={{ scale: disabled || isLoading ? 1 : 0.98 }}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Loading...</span>
          </>
        ) : (
          <>
            {icon && <span className="flex-shrink-0">{icon}</span>}
            {children}
          </>
        )}
      </motion.button>
    );
  },
);

OnboardingButton.displayName = "OnboardingButton";
