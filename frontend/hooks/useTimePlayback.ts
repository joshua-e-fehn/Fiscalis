import { useState, useEffect, useCallback, useRef } from "react";

import { YEAR_RANGE } from "@/lib/types/worldbank";

// ═══════════════════════════════════════════════════════════════
// Time Playback Hook
// ═══════════════════════════════════════════════════════════════

/** Speed configuration with interval and step size */
export interface PlaybackSpeed {
  /** Interval between ticks in milliseconds */
  interval: number;
  /** Number of years to advance per tick */
  step: number;
}

interface UseTimePlaybackOptions {
  /** Initial year to start at */
  initialYear?: number;
  /** Minimum year in range */
  minYear?: number;
  /** Maximum year in range */
  maxYear?: number;
  /** Interval between year changes in milliseconds */
  intervalMs?: number;
  /** Callback when year changes */
  onYearChange?: (year: number) => void;
  /** Whether to loop back to start when reaching end */
  loop?: boolean;
  /** Optional function to check if a year's data is cached */
  isYearCached?: (year: number) => boolean;
  /** If true and data isn't cached, skip uncached years during playback */
  skipUncachedYears?: boolean;
}

interface UseTimePlaybackReturn {
  /** Current year */
  year: number;
  /** Set the current year */
  setYear: (year: number) => void;
  /** Whether playback is currently running */
  isPlaying: boolean;
  /** Start playback */
  play: () => void;
  /** Pause playback */
  pause: () => void;
  /** Toggle play/pause */
  toggle: () => void;
  /** Reset to initial year and stop playback */
  reset: () => void;
  /** Jump to start (min year) */
  jumpToStart: () => void;
  /** Jump to end (max year) */
  jumpToEnd: () => void;
  /** Step forward by specified years */
  stepForward: (years?: number) => void;
  /** Step backward by specified years */
  stepBackward: (years?: number) => void;
  /** Set playback speed */
  setSpeed: (speed: PlaybackSpeed) => void;
  /** Current playback speed configuration */
  speed: PlaybackSpeed;
}

// Default speed configuration
const DEFAULT_SPEED: PlaybackSpeed = { interval: 500, step: 1 };

export function useTimePlayback({
  initialYear = 2020,
  minYear = YEAR_RANGE.min,
  maxYear = YEAR_RANGE.max,
  intervalMs = 500,
  onYearChange,
  loop = true,
  isYearCached,
  skipUncachedYears = false,
}: UseTimePlaybackOptions = {}): UseTimePlaybackReturn {
  const [year, setYearState] = useState(initialYear);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<PlaybackSpeed>({
    interval: intervalMs,
    step: 1,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Mirrors `year` so the next year is computed outside setState updaters,
  // which must stay pure (StrictMode runs them twice).
  const yearRef = useRef(initialYear);
  const onYearChangeRef = useRef(onYearChange);
  const isYearCachedRef = useRef(isYearCached);

  // Keep the callback refs updated
  useEffect(() => {
    onYearChangeRef.current = onYearChange;
  }, [onYearChange]);

  useEffect(() => {
    isYearCachedRef.current = isYearCached;
  }, [isYearCached]);

  // The single place that changes the year and fires the callback
  const commitYear = useCallback((next: number) => {
    yearRef.current = next;
    setYearState(next);
    onYearChangeRef.current?.(next);
  }, []);

  // Wrapper to set year and trigger callback
  const setYear = useCallback(
    (newYear: number) => {
      commitYear(Math.max(minYear, Math.min(maxYear, newYear)));
    },
    [minYear, maxYear, commitYear],
  );

  // Playback controls
  const play = useCallback(() => {
    setIsPlaying(true);
  }, []);

  const pause = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const toggle = useCallback(() => {
    setIsPlaying((prev) => !prev);
  }, []);

  const reset = useCallback(() => {
    setIsPlaying(false);
    setYear(initialYear);
  }, [initialYear, setYear]);

  const jumpToStart = useCallback(() => {
    setYear(minYear);
  }, [minYear, setYear]);

  const jumpToEnd = useCallback(() => {
    setYear(maxYear);
  }, [maxYear, setYear]);

  const stepForward = useCallback(
    (years: number = 1) => {
      commitYear(Math.min(maxYear, yearRef.current + years));
    },
    [maxYear, commitYear],
  );

  const stepBackward = useCallback(
    (years: number = 1) => {
      commitYear(Math.max(minYear, yearRef.current - years));
    },
    [minYear, commitYear],
  );

  // Find next cached year (for skipUncachedYears mode)
  const findNextCachedYear = useCallback(
    (
      fromYear: number,
      direction: 1 | -1 = 1,
      stepSize: number = 1,
    ): number | null => {
      if (!isYearCachedRef.current) return fromYear + direction * stepSize;

      let searchYear = fromYear + direction;
      const limit = direction === 1 ? maxYear : minYear;

      while (direction === 1 ? searchYear <= limit : searchYear >= limit) {
        if (isYearCachedRef.current(searchYear)) {
          return searchYear;
        }
        searchYear += direction;
      }

      // If looping, search from the other end
      if (loop) {
        searchYear = direction === 1 ? minYear : maxYear;
        const loopLimit = fromYear;
        while (
          direction === 1 ? searchYear < loopLimit : searchYear > loopLimit
        ) {
          if (isYearCachedRef.current(searchYear)) {
            return searchYear;
          }
          searchYear += direction;
        }
      }

      return null;
    },
    [maxYear, minYear, loop],
  );

  // Animation loop
  useEffect(() => {
    if (isPlaying) {
      const { interval, step } = speed;

      intervalRef.current = setInterval(() => {
        const prev = yearRef.current;
        let next = prev + step;

        // If skipUncachedYears is enabled, find the next cached year
        if (skipUncachedYears && isYearCachedRef.current) {
          // Check if next year is cached, if not find closest cached year
          if (!isYearCachedRef.current(next)) {
            // Try to find a cached year between prev and next
            for (let y = prev + 1; y <= Math.min(next, maxYear); y++) {
              if (isYearCachedRef.current(y)) {
                next = y;
                break;
              }
            }
            // If still not cached, find any cached year forward
            if (!isYearCachedRef.current(next)) {
              const cachedYear = findNextCachedYear(prev, 1, step);
              if (cachedYear === null) {
                // No cached years available, stay on current
                return;
              }
              next = cachedYear;
            }
          }
        }

        if (next > maxYear) {
          if (!loop) {
            setIsPlaying(false);
            return;
          }
          // When looping, find first cached year from start
          if (skipUncachedYears && isYearCachedRef.current) {
            const firstCached = findNextCachedYear(minYear - 1, 1, step);
            if (firstCached !== null) {
              commitYear(firstCached);
              return;
            }
          }
          commitYear(minYear);
          return;
        }
        commitYear(next);
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [
    isPlaying,
    maxYear,
    minYear,
    speed,
    loop,
    skipUncachedYears,
    findNextCachedYear,
    commitYear,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    year,
    setYear,
    isPlaying,
    play,
    pause,
    toggle,
    reset,
    jumpToStart,
    jumpToEnd,
    stepForward,
    stepBackward,
    setSpeed,
    speed,
  };
}
