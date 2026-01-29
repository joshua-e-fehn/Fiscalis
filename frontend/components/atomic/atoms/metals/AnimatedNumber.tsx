"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface AnimatedNumberProps {
  value: number;
  formatFn?: (value: number) => string;
  duration?: number;
  className?: string;
}

/**
 * Animated number component that smoothly transitions between values
 */
export function AnimatedNumber({
  value,
  formatFn = (v) => v.toLocaleString(),
  duration = 500,
  className,
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);
  const previousValue = useRef(value);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (previousValue.current === value) return;

    const startValue = previousValue.current;
    const endValue = value;
    const startTime = performance.now();

    setIsAnimating(true);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Easing function (ease-out-cubic)
      const eased = 1 - Math.pow(1 - progress, 3);

      const currentValue = startValue + (endValue - startValue) * eased;
      setDisplayValue(currentValue);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endValue);
        setIsAnimating(false);
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

  const isPositiveChange = value > previousValue.current;
  const isNegativeChange = value < previousValue.current;

  return (
    <span
      className={cn(
        "transition-colors duration-300",
        isAnimating && isPositiveChange && "text-profit",
        isAnimating && isNegativeChange && "text-loss",
        className,
      )}
    >
      {formatFn(displayValue)}
    </span>
  );
}
