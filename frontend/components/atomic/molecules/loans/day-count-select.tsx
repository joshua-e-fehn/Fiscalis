"use client";

import {
  DAY_COUNT_CONVENTIONS,
  type DayCountConvention,
} from "@/../services/finance/loanScheduleService";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Label } from "@/components/ui/shadcn/label";

// Select items can't have an empty value: "flat" stands for an unset
// convention (rate / payments per year, the engine's default)
const FLAT = "flat";

const LABELS: Record<DayCountConvention, string> = {
  "30/360": "30/360 (30-day months)",
  "ACT/360": "ACT/360 (actual days / 360)",
  "ACT/365": "ACT/365 (actual days / 365)",
  "ACT/ACT": "ACT/ACT (actual days / actual year)",
};

interface DayCountSelectProps {
  id: string;
  value: DayCountConvention | undefined;
  onChange: (value: DayCountConvention | undefined) => void;
}

/** The loan's interest day-count convention; unset is flat periods. */
export function DayCountSelect({ id, value, onChange }: DayCountSelectProps) {
  return (
    <div>
      <Label htmlFor={id}>Interest day count</Label>
      <Select
        value={value ?? FLAT}
        onValueChange={(v) =>
          onChange(v === FLAT ? undefined : (v as DayCountConvention))
        }
      >
        <SelectTrigger id={id} className="mt-1.5">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={FLAT}>Equal periods (default)</SelectItem>
          {DAY_COUNT_CONVENTIONS.map((convention) => (
            <SelectItem key={convention} value={convention}>
              {LABELS[convention]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
