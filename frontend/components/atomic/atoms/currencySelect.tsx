"use client";

/**
 * CurrencySelect
 *
 * The currency of an amount a user enters (a metal purchase or sale price):
 * the display currencies, plus the value already chosen or stored when it
 * is none of them, so editing never drops a stored currency. Values are ISO
 * codes ("EUR"); the amount is stored in that currency as entered.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { currencySymbols, toInvestmentCurrency } from "@/lib/utils/currency";
import { DISPLAY_CURRENCIES } from "@/../services/finance/displayCurrency";

/** "EUR (€)"; a code without a short symbol stands alone ("CHF", "SEK"). */
function currencyLabel(code: string): string {
  const known = toInvestmentCurrency(code);
  const symbol = known ? currencySymbols[known].trim() : code;
  return symbol === code ? code : `${code} (${symbol})`;
}

interface CurrencySelectProps {
  /** ISO code, e.g. "EUR" */
  value: string;
  onValueChange: (code: string) => void;
  id?: string;
}

export function CurrencySelect({ value, onValueChange, id }: CurrencySelectProps) {
  const code = value.toUpperCase();
  const codes: readonly string[] = (DISPLAY_CURRENCIES as readonly string[]).includes(code)
    ? DISPLAY_CURRENCIES
    : [...DISPLAY_CURRENCIES, code];

  return (
    <Select value={code} onValueChange={onValueChange}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {codes.map((option) => (
          <SelectItem key={option} value={option}>
            {currencyLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
