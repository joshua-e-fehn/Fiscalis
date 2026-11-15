/**
 * The Arabic catalogue, one JSON file per namespace like
 * messages/en/. Kept here rather than in i18n/messages.ts so each language
 * adds one import and one entry there. `satisfies Messages` makes a missing
 * key fail `tsc`; services/i18n/i18n.test.ts checks extra keys and ICU.
 */
import type { Messages } from "@/i18n/messages";

import common from "./common.json";
import worldMap from "./worldMap.json";
import calculators from "./calculators.json";
import retirement from "./retirement.json";
import integrations from "./integrations.json";
import categories from "./categories.json";
import dashboard from "./dashboard.json";
import legal from "./legal.json";
import onboarding from "./onboarding.json";
import landing from "./landing.json";
import navigation from "./navigation.json";
import loans from "./loans.json";
import metals from "./metals.json";
import assets from "./assets.json";
import settings from "./settings.json";
import strategies from "./strategies.json";
import docs from "./docs.json";
import billing from "./billing.json";
import notifications from "./notifications.json";

export const ar = {
  common,
  worldMap,
  calculators,
  retirement,
  integrations,
  categories,
  dashboard,
  legal,
  onboarding,
  landing,
  navigation,
  loans,
  metals,
  assets,
  settings,
  strategies,
  docs,
  billing,
  notifications,
} satisfies Messages;
