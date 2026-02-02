/**
 * Time Range Selection Hook
 *
 * Manages time range state and provides utilities for time range selection UI.
 */

import { useState, useCallback, useMemo } from "react";
import type { TimeRange, PerformanceTimeRangeLabel } from "@/lib/performance";
import {
  TIME_RANGE_LABEL_MAP,
  TIME_RANGE_TO_LABEL,
  DEFAULT_TIME_RANGE_OPTIONS,
  labelToTimeRange,
  timeRangeToLabel,
} from "@/lib/performance";

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface UseTimeRangeSelectionOptions {
  /** Initial time range (default: "1M") */
  defaultRange?: PerformanceTimeRangeLabel;
  /** Available time range options */
  availableRanges?: readonly PerformanceTimeRangeLabel[];
  /** Callback when range changes */
  onChange?: (range: PerformanceTimeRangeLabel) => void;
}

export interface TimeRangeOption {
  label: PerformanceTimeRangeLabel;
  value: TimeRange;
  displayName: string;
}

export interface UseTimeRangeSelectionResult {
  /** Currently selected time range label (UI-friendly) */
  selectedLabel: PerformanceTimeRangeLabel;
  /** Currently selected TimeRange (service-compatible) */
  selectedRange: TimeRange;
  /** Set the selected time range by label */
  setRange: (label: PerformanceTimeRangeLabel) => void;
  /** Available time range options for UI */
  options: TimeRangeOption[];
  /** Check if a range is currently selected */
  isSelected: (label: PerformanceTimeRangeLabel) => boolean;
}

// ═══════════════════════════════════════════════════════════════
// Display Names
// ═══════════════════════════════════════════════════════════════

const DISPLAY_NAMES: Record<PerformanceTimeRangeLabel, string> = {
  "1H": "1 Hour",
  "1D": "1 Day",
  "1W": "1 Week",
  "1M": "1 Month",
  "3M": "3 Months",
  "6M": "6 Months",
  YTD: "Year to Date",
  "1Y": "1 Year",
  "3Y": "3 Years",
  "5Y": "5 Years",
  ALL: "All Time",
};

// ═══════════════════════════════════════════════════════════════
// Hook Implementation
// ═══════════════════════════════════════════════════════════════

/**
 * Hook for managing time range selection state
 *
 * @example
 * ```tsx
 * const { selectedLabel, setRange, options } = useTimeRangeSelection({
 *   defaultRange: "3M",
 * });
 *
 * return (
 *   <div>
 *     {options.map(opt => (
 *       <button
 *         key={opt.label}
 *         onClick={() => setRange(opt.label)}
 *         className={selectedLabel === opt.label ? "active" : ""}
 *       >
 *         {opt.label}
 *       </button>
 *     ))}
 *   </div>
 * );
 * ```
 */
export function useTimeRangeSelection(
  options: UseTimeRangeSelectionOptions = {},
): UseTimeRangeSelectionResult {
  const {
    defaultRange = "1M",
    availableRanges = DEFAULT_TIME_RANGE_OPTIONS,
    onChange,
  } = options;

  const [selectedLabel, setSelectedLabel] =
    useState<PerformanceTimeRangeLabel>(defaultRange);

  // Convert label to TimeRange
  const selectedRange = useMemo(
    () => labelToTimeRange(selectedLabel),
    [selectedLabel],
  );

  // Build options array
  const rangeOptions = useMemo<TimeRangeOption[]>(() => {
    return availableRanges.map((label) => ({
      label,
      value: TIME_RANGE_LABEL_MAP[label],
      displayName: DISPLAY_NAMES[label],
    }));
  }, [availableRanges]);

  // Set range handler
  const setRange = useCallback(
    (label: PerformanceTimeRangeLabel) => {
      setSelectedLabel(label);
      onChange?.(label);
    },
    [onChange],
  );

  // Check if selected
  const isSelected = useCallback(
    (label: PerformanceTimeRangeLabel) => label === selectedLabel,
    [selectedLabel],
  );

  return {
    selectedLabel,
    selectedRange,
    setRange,
    options: rangeOptions,
    isSelected,
  };
}
