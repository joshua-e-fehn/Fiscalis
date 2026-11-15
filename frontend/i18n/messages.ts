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
import settingsEn from "@/messages/en/settings.json";
import settingsDe from "@/messages/de/settings.json";
import strategiesEn from "@/messages/en/strategies.json";
import strategiesDe from "@/messages/de/strategies.json";
import docsEn from "@/messages/en/docs.json";
import docsDe from "@/messages/de/docs.json";
import billingEn from "@/messages/en/billing.json";
import billingDe from "@/messages/de/billing.json";
import commonEs from "@/messages/es/common.json";
import worldMapEs from "@/messages/es/worldMap.json";
import calculatorsEs from "@/messages/es/calculators.json";
import retirementEs from "@/messages/es/retirement.json";
import integrationsEs from "@/messages/es/integrations.json";
import categoriesEs from "@/messages/es/categories.json";
import dashboardEs from "@/messages/es/dashboard.json";
import legalEs from "@/messages/es/legal.json";
import onboardingEs from "@/messages/es/onboarding.json";
import landingEs from "@/messages/es/landing.json";
import navigationEs from "@/messages/es/navigation.json";
import loansEs from "@/messages/es/loans.json";
import metalsEs from "@/messages/es/metals.json";
import assetsEs from "@/messages/es/assets.json";
import settingsEs from "@/messages/es/settings.json";
import strategiesEs from "@/messages/es/strategies.json";
import docsEs from "@/messages/es/docs.json";
import billingEs from "@/messages/es/billing.json";

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
  settings: settingsEn,
  strategies: strategiesEn,
  docs: docsEn,
  billing: billingEn,
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
  settings: settingsDe,
  strategies: strategiesDe,
  docs: docsDe,
  billing: billingDe,
} satisfies Messages;

const es = {
  common: commonEs,
  worldMap: worldMapEs,
  calculators: calculatorsEs,
  retirement: retirementEs,
  integrations: integrationsEs,
  categories: categoriesEs,
  dashboard: dashboardEs,
  legal: legalEs,
  onboarding: onboardingEs,
  landing: landingEs,
  navigation: navigationEs,
  loans: loansEs,
  metals: metalsEs,
  assets: assetsEs,
  settings: settingsEs,
  strategies: strategiesEs,
  docs: docsEs,
  billing: billingEs,
} satisfies Messages;

const MESSAGES: Record<Language, Messages> = { en, de, es };

export function messagesFor(language: Language): Messages {
  return MESSAGES[language];
}
