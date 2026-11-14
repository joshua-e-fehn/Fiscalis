"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  /**
   * Formats each frame's value: pass a lib/utils/currency.ts helper
   * (formatCurrency, formatPercent) so amounts keep the house style
   */
  formatFn: (value: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Animated number component that smoothly transitions between values
 */
export function AnimatedNumber({
  value,
  formatFn,
  duration = 500,
  className,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  // Set while animating: the colour of the change
  const [direction, setDirection] = useState<"up" | "down" | null>(null);
  const previousValue = useRef(value);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (previousValue.current === value) return;

    const startValue = previousValue.current;
    const endValue = value;
    const startTime = performance.now();

    const change = endValue > startValue ? "up" : "down";

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out-cubic)
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + (endValue - startValue) * eased;
      setDisplayValue(currentValue);
      // Set in the frame callback, not the effect body: same value each frame
      setDirection(change);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setDirection(null);
        previousValue.current = endValue;
      }
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span
      className={cn(
        "transition-colors duration-300",
        direction === "up" && "text-profit",
        direction === "down" && "text-loss",
        className,
      )}
    >
      {formatFn(displayValue)}
    </span>
  );
}
