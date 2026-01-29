"use client";

import { cn } from "@/lib/utils";

interface ShimmerSkeletonProps {
  className?: string;
}

/**
 * A skeleton loading component with a shimmer animation effect
 */
export function ShimmerSkeleton({ className }: ShimmerSkeletonProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded bg-muted",
        "before:absolute before:inset-0",
        "before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
        "before:animate-shimmer",
        className,
      )}
    />
  );
}

/**
 * A card skeleton for metal holdings loading state
 */
export function HoldingCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "border rounded-lg p-4 space-y-3 border-l-4 border-l-muted",
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-2 flex-1">
          <ShimmerSkeleton className="h-5 w-3/4" />
          <ShimmerSkeleton className="h-4 w-1/2" />
        </div>
        <ShimmerSkeleton className="h-5 w-12 rounded-full" />
      </div>
      <div className="flex items-center gap-2">
        <ShimmerSkeleton className="h-5 w-14 rounded-full" />
        <ShimmerSkeleton className="h-5 w-10 rounded-full" />
      </div>
      <div className="flex items-end justify-between">
        <div className="space-y-1">
          <ShimmerSkeleton className="h-4 w-16" />
          <ShimmerSkeleton className="h-3 w-12" />
        </div>
        <div className="text-right space-y-1">
          <ShimmerSkeleton className="h-6 w-24" />
          <ShimmerSkeleton className="h-4 w-16 ml-auto" />
        </div>
      </div>
    </div>
  );
}

import { MetalsType } from "@/lib/types/metals-extended";

const metalBorderColors: Record<MetalsType, string> = {
  gold: "border-l-metal-gold",
  silver: "border-l-metal-silver",
  platinum: "border-l-metal-platinum",
  palladium: "border-l-metal-palladium",
};

/**
 * A summary card skeleton for loading state
 */
export function SummaryCardSkeleton({
  className,
  metal,
}: {
  className?: string;
  metal?: MetalsType;
}) {
  return (
    <div
      className={cn(
        "border rounded-lg p-4 space-y-3 border-l-4",
        metal ? metalBorderColors[metal] : "border-l-muted",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <ShimmerSkeleton className="h-5 w-5 rounded" />
        <ShimmerSkeleton className="h-4 w-16" />
      </div>
      <ShimmerSkeleton className="h-7 w-28" />
      <div className="flex items-center gap-2">
        <ShimmerSkeleton className="h-4 w-12" />
        <ShimmerSkeleton className="h-4 w-14" />
      </div>
    </div>
  );
}

/**
 * A value card skeleton for total value/P&L loading states
 */
export function ValueCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("border rounded-lg p-6 space-y-3", className)}>
      <div className="flex items-center gap-2">
        <ShimmerSkeleton className="h-4 w-4" />
        <ShimmerSkeleton className="h-4 w-32" />
      </div>
      <ShimmerSkeleton className="h-9 w-36" />
      <ShimmerSkeleton className="h-4 w-24" />
    </div>
  );
}

/**
 * Transaction row skeleton
 */
export function TransactionRowSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-4 py-3 px-4", className)}>
      <ShimmerSkeleton className="h-4 w-12" />
      <ShimmerSkeleton className="h-6 w-16 rounded-md" />
      <div className="flex-1 flex items-center gap-2">
        <ShimmerSkeleton className="h-5 w-12 rounded-full" />
        <ShimmerSkeleton className="h-4 w-32" />
      </div>
      <ShimmerSkeleton className="h-4 w-20" />
      <ShimmerSkeleton className="h-4 w-20" />
    </div>
  );
}
