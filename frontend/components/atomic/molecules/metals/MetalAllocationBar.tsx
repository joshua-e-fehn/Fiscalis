"use client";

import { cn } from "@/lib/utils";
import { MetalsType, MetalsSummary } from "@/lib/types/metals-extended";

interface MetalAllocationBarProps {
  summary: MetalsSummary;
  className?: string;
}

const metalColors: Record<MetalsType, string> = {
  gold: "bg-metal-gold",
  silver: "bg-metal-silver",
  platinum: "bg-metal-platinum",
  palladium: "bg-metal-palladium",
};

const metalLabels: Record<MetalsType, string> = {
  gold: "Gold",
  silver: "Silver",
  platinum: "Platinum",
  palladium: "Palladium",
};

export function MetalAllocationBar({
  summary,
  className,
}: MetalAllocationBarProps) {
  const metals: MetalsType[] = ["gold", "silver", "platinum", "palladium"];

  // Filter out metals with 0 allocation
  const activeMetals = metals.filter((m) => summary.allocation[m] > 0);

  if (activeMetals.length === 0) {
    return (
      <div className={cn("w-full", className)}>
        <div className="h-3 bg-muted rounded-full" />
        <div className="flex justify-center mt-2 text-xs text-muted-foreground">
          No holdings yet
        </div>
      </div>
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Bar */}
      <div className="h-3 rounded-full overflow-hidden flex bg-muted">
        {activeMetals.map((metal) => (
          <div
            key={metal}
            className={cn(metalColors[metal], "transition-all duration-300")}
            style={{ width: `${summary.allocation[metal]}%` }}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {activeMetals.map((metal) => (
          <div key={metal} className="flex items-center gap-1.5 text-xs">
            <div
              className={cn("w-2.5 h-2.5 rounded-full", metalColors[metal])}
            />
            <span className="text-muted-foreground">{metalLabels[metal]}</span>
            <span className="font-medium">
              {summary.allocation[metal].toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Compact version for smaller spaces
export function MetalAllocationBarCompact({
  summary,
  className,
}: MetalAllocationBarProps) {
  const metals: MetalsType[] = ["gold", "silver", "platinum", "palladium"];
  const activeMetals = metals.filter((m) => summary.allocation[m] > 0);

  if (activeMetals.length === 0) {
    return (
      <div className={cn("h-2 bg-muted rounded-full w-full", className)} />
    );
  }

  return (
    <div
      className={cn(
        "h-2 rounded-full overflow-hidden flex bg-muted",
        className,
      )}
    >
      {activeMetals.map((metal) => (
        <div
          key={metal}
          className={cn(metalColors[metal], "transition-all duration-300")}
          style={{ width: `${summary.allocation[metal]}%` }}
        />
      ))}
    </div>
  );
}
