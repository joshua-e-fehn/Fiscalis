/**
 * The message catalogues, one JSON file per namespace under
 * messages/<language>/. Every namespace is imported statically for every
 * language: German is checked against English with `satisfies`, so a missing
 * German key fails `bunx tsc` and `bun run build`. Extra keys and mismatched
 * ICU arguments are caught by services/i18n/i18n.test.ts.
 *
 * Adding a namespace: add messages/en/<ns>.json and messages/de/<ns>.json and
 * one line to each object below.
 */
import commonEn from "@/messages/en/common.json";
import commonDe from "@/messages/de/common.json";
import worldMapEn from "@/messages/en/worldMap.json";
import worldMapDe from "@/messages/de/worldMap.json";
import calculatorsEn from "@/messages/en/calculators.json";
import calculatorsDe from "@/messages/de/calculators.json";

import type { Language } from "./locales";

const en = {
  common: commonEn,
  worldMap: worldMapEn,
  calculators: calculatorsEn,
};

export type Messages = typeof en;

const de = {
  common: commonDe,
  worldMap: worldMapDe,
  calculators: calculatorsDe,
} satisfies Messages;

const MESSAGES: Record<Language, Messages> = { en, de };

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}
