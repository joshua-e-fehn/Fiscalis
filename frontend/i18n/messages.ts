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
import retirementEn from "@/messages/en/retirement.json";
import retirementDe from "@/messages/de/retirement.json";
import integrationsEn from "@/messages/en/integrations.json";
import integrationsDe from "@/messages/de/integrations.json";
import categoriesEn from "@/messages/en/categories.json";
import categoriesDe from "@/messages/de/categories.json";
import dashboardEn from "@/messages/en/dashboard.json";
import dashboardDe from "@/messages/de/dashboard.json";
import legalEn from "@/messages/en/legal.json";
import legalDe from "@/messages/de/legal.json";
import onboardingEn from "@/messages/en/onboarding.json";
import onboardingDe from "@/messages/de/onboarding.json";
import landingEn from "@/messages/en/landing.json";
import landingDe from "@/messages/de/landing.json";
import navigationEn from "@/messages/en/navigation.json";
import navigationDe from "@/messages/de/navigation.json";
import loansEn from "@/messages/en/loans.json";
import loansDe from "@/messages/de/loans.json";
import metalsEn from "@/messages/en/metals.json";
import metalsDe from "@/messages/de/metals.json";
import assetsEn from "@/messages/en/assets.json";
import assetsDe from "@/messages/de/assets.json";

import type { Language } from "./locales";

const en = {
  common: commonEn,
  worldMap: worldMapEn,
  calculators: calculatorsEn,
  retirement: retirementEn,
  integrations: integrationsEn,
  categories: categoriesEn,
  dashboard: dashboardEn,
  legal: legalEn,
  onboarding: onboardingEn,
  landing: landingEn,
  navigation: navigationEn,
  loans: loansEn,
  metals: metalsEn,
  assets: assetsEn,
};

export type Messages = typeof en;

const de = {
  common: commonDe,
  worldMap: worldMapDe,
  calculators: calculatorsDe,
  retirement: retirementDe,
  integrations: integrationsDe,
  categories: categoriesDe,
  dashboard: dashboardDe,
  legal: legalDe,
  onboarding: onboardingDe,
  landing: landingDe,
  navigation: navigationDe,
  loans: loansDe,
  metals: metalsDe,
  assets: assetsDe,
} satisfies Messages;

const MESSAGES: Record<Language, Messages> = { en, de };

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}
