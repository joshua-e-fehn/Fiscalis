"use client";

import * as React from "react";
import { Slider } from "@/components/ui/shadcn/slider";
import { Button } from "@/components/ui/shadcn/button";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { YEAR_RANGE } from "@/lib/types/worldbank";

// ═══════════════════════════════════════════════════════════════
// Time Slider Component
// ═══════════════════════════════════════════════════════════════

interface TimeSliderProps {
  /** Current year value */
  value: number;
  /** Called on every slider change (while dragging) */
  onChange: (year: number) => void;
  /** Called when slider interaction ends (mouse up, touch end) */
  onChangeCommitted?: (year: number) => void;
  /** Minimum year */
  min?: number;
  /** Maximum year */
  max?: number;
  /** Years to show as markers on the slider */
  decadeMarkers?: number[];
  /** Whether playback animation is running */
  isPlaying?: boolean;
  /** Toggle play/pause */
  onPlayToggle?: () => void;
  /** Step forward callback */
  onStepForward?: (years?: number) => void;
  /** Step backward callback */
  onStepBackward?: (years?: number) => void;
  /** Jump to start */
  onJumpToStart?: () => void;
  /** Jump to end */
  onJumpToEnd?: () => void;
  /** Whether to show quick jump buttons */
  showQuickJumps?: boolean;
  /** Whether the component is in loading state */
  isLoading?: boolean;
  /** Custom class name */
  className?: string;
}

export function TimeSlider({
  value,
  onChange,
  onChangeCommitted,
  min = YEAR_RANGE.min,
  max = YEAR_RANGE.max,
  decadeMarkers = [1970, 1980, 1990, 2000, 2010, 2020],
  isPlaying = false,
  onPlayToggle,
  onStepForward,
  onStepBackward,
  onJumpToStart,
  onJumpToEnd,
  showQuickJumps = true,
  isLoading = false,
  className,
}: TimeSliderProps) {
  // Filter decade markers to only show those within range
  const visibleMarkers = decadeMarkers.filter((y) => y > min && y < max);

  // Handle step controls with fallbacks
  const handleStepBackward = () => {
    if (onStepBackward) {
      onStepBackward(1);
    } else {
      const newValue = Math.max(min, value - 1);
      onChange(newValue);
      onChangeCommitted?.(newValue);
    }
  };

  const handleStepForward = () => {
    if (onStepForward) {
      onStepForward(1);
    } else {
      const newValue = Math.min(max, value + 1);
      onChange(newValue);
      onChangeCommitted?.(newValue);
    }
  };

  const handleJumpBackward = () => {
    if (onJumpToStart) {
      onJumpToStart();
    } else {
      onChange(min);
      onChangeCommitted?.(min);
    }
  };

  const handleJumpForward = () => {
    if (onJumpToEnd) {
      onJumpToEnd();
    } else {
      onChange(max);
      onChangeCommitted?.(max);
    }
  };

  const handleQuickJump = (year: number) => {
    onChange(year);
    onChangeCommitted?.(year);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Main control row */}
      <div className="flex items-center gap-3">
        {/* Playback controls */}
        <div className="flex items-center gap-1">
          {/* Jump to start */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleJumpBackward}
            disabled={value === min || isLoading}
            title="Jump to start"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>

          {/* Step backward */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleStepBackward}
            disabled={value === min || isLoading}
            title="Step backward"
          >
            <SkipBack className="h-4 w-4" />
          </Button>

          {/* Play/Pause */}
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9"
            onClick={onPlayToggle}
            disabled={isLoading}
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 ml-0.5" />
            )}
          </Button>

          {/* Step forward */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleStepForward}
            disabled={value === max || isLoading}
            title="Step forward"
          >
            <SkipForward className="h-4 w-4" />
          </Button>

          {/* Jump to end */}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={handleJumpForward}
            disabled={value === max || isLoading}
            title="Jump to end"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Year display */}
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-2xl font-bold tabular-nums w-16 text-center transition-opacity",
              isLoading && "opacity-50",
            )}
          >
            {value}
          </span>
        </div>

        {/* Slider */}
        <div className="flex-1 relative pb-5">
          <Slider
            value={[value]}
            min={min}
            max={max}
            step={1}
            onValueChange={([v]) => onChange(v)}
            onValueCommit={([v]) => onChangeCommitted?.(v)}
            disabled={isLoading}
            className="w-full"
          />

          {/* Year markers */}
          <div className="absolute bottom-0 w-full flex justify-between px-0 text-xs text-muted-foreground select-none pointer-events-none">
            <span className="w-8 text-left">{min}</span>
            {visibleMarkers.map((year) => {
              const position = ((year - min) / (max - min)) * 100;
              return (
                <span
                  key={year}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${position}%` }}
                >
                  {year}
                </span>
              );
            })}
            <span className="w-8 text-right">{max}</span>
          </div>
        </div>
      </div>

      {/* Quick jump buttons */}
      {showQuickJumps && (
        <div className="flex gap-2 justify-center flex-wrap">
          {visibleMarkers.map((year) => (
            <Button
              key={year}
              variant={value === year ? "default" : "outline"}
              size="sm"
              onClick={() => handleQuickJump(year)}
              disabled={isLoading}
              className="tabular-nums"
            >
              {year}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Compact Time Slider (for smaller spaces)
// ═══════════════════════════════════════════════════════════════

interface CompactTimeSliderProps {
  value: number;
  onChange: (year: number) => void;
  onChangeCommitted?: (year: number) => void;
  min?: number;
  max?: number;
  isPlaying?: boolean;
  onPlayToggle?: () => void;
  isLoading?: boolean;
  className?: string;
}

export function CompactTimeSlider({
  value,
  onChange,
  onChangeCommitted,
  min = YEAR_RANGE.min,
  max = YEAR_RANGE.max,
  isPlaying = false,
  onPlayToggle,
  isLoading = false,
  className,
}: CompactTimeSliderProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {/* Play/Pause */}
      <Button
        variant="outline"
        size="icon"
        className="h-8 w-8 shrink-0"
        onClick={onPlayToggle}
        disabled={isLoading}
      >
        {isPlaying ? (
          <Pause className="h-3 w-3" />
        ) : (
          <Play className="h-3 w-3 ml-0.5" />
        )}
      </Button>

      {/* Year display */}
      <span
        className={cn(
          "text-sm font-semibold tabular-nums w-10 shrink-0",
          isLoading && "opacity-50",
        )}
      >
        {value}
      </span>

      {/* Slider */}
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={1}
        onValueChange={([v]) => onChange(v)}
        onValueCommit={([v]) => onChangeCommitted?.(v)}
        disabled={isLoading}
        className="flex-1"
      />

      {/* Max year */}
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {max}
      </span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Speed Control Component
// ═══════════════════════════════════════════════════════════════

import type { PlaybackSpeed } from "@/hooks/useTimePlayback";

interface SpeedControlProps {
  speed: PlaybackSpeed;
  onSpeedChange: (speed: PlaybackSpeed) => void;
  className?: string;
}

// Speed options: slower speeds just change interval, faster speeds also increase step
const SPEED_OPTIONS: { label: string; value: PlaybackSpeed }[] = [
  { label: "0.5x", value: { interval: 1000, step: 1 } },
  { label: "1x", value: { interval: 500, step: 1 } },
  { label: "2x", value: { interval: 400, step: 1 } },
  { label: "4x", value: { interval: 350, step: 2 } },
];

export function SpeedControl({
  speed,
  onSpeedChange,
  className,
}: SpeedControlProps) {
  // Find which option is selected (compare both interval and step)
  const isSelected = (option: PlaybackSpeed) =>
    speed.interval === option.interval && speed.step === option.step;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <span className="text-xs text-muted-foreground mr-1">Speed:</span>
      {SPEED_OPTIONS.map((option) => (
        <Button
          key={option.label}
          variant={isSelected(option.value) ? "default" : "ghost"}
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={() => onSpeedChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}
