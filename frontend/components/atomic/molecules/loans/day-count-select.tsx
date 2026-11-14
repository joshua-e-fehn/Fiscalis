"use client";

import { useTranslations } from "next-intl";
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

// The message key of each convention's label (loans.dayCount.*)
const LABEL_KEYS = {
  "30/360": "thirty360",
  "ACT/360": "act360",
  "ACT/365": "act365",
  "ACT/ACT": "actAct",
} as const satisfies Record<DayCountConvention, string>;

interface DayCountSelectProps {
  id: string;
  value: DayCountConvention | undefined;
  onChange: (value: DayCountConvention | undefined) => void;
}

/** The loan's interest day-count convention; unset is flat periods. */
export function DayCountSelect({ id, value, onChange }: DayCountSelectProps) {
  const t = useTranslations("loans.dayCount");
  return (
    <div>
      <Label htmlFor={id}>{t("label")}</Label>
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
          <SelectItem value={FLAT}>{t("flat")}</SelectItem>
          {DAY_COUNT_CONVENTIONS.map((convention) => (
            <SelectItem key={convention} value={convention}>
              {t(LABEL_KEYS[convention])}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
