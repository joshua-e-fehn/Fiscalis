"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface PriceUpdateIndicatorProps {
  isUpdating?: boolean;
  lastUpdated?: Date | number | null;
  className?: string;
}

function formatTimeAgo(date: Date | number): string {
  const now = new Date();
  const then = typeof date === "number" ? new Date(date) : date;
  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.floor(diffMs / 1000);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

/**
 * Shows real-time price update status with timestamp
 */
export function PriceUpdateIndicator({
  isUpdating = false,
  lastUpdated,
  className,
}: PriceUpdateIndicatorProps) {
  const [timeAgo, setTimeAgo] = useState<string>("");

  useEffect(() => {
    if (!lastUpdated) return;

    // Update immediately
    setTimeAgo(formatTimeAgo(lastUpdated));

    // Update every second
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(lastUpdated));
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdated]);

  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {isUpdating ? (
        <>
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Updating...</span>
        </>
      ) : lastUpdated ? (
        <>
          <span>Updated {timeAgo}</span>
        </>
      ) : null}
    </div>
  );
}
