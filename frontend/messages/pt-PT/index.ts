/**
 * The European Portuguese (pt-PT) catalogue, one JSON file per namespace,
 * checked against English with `satisfies` like German in
 * i18n/messages.ts. Informal "tu" register; brand names stay untranslated.
 */
import type { Messages } from "@/i18n/messages";

import assets from "./assets.json";
import billing from "./billing.json";
import notifications from "./notifications.json";
import teams from "./teams.json";
import calculators from "./calculators.json";
import categories from "./categories.json";
import common from "./common.json";
import dashboard from "./dashboard.json";
import docs from "./docs.json";
import integrations from "./integrations.json";
import landing from "./landing.json";
import legal from "./legal.json";
import loans from "./loans.json";
import metals from "./metals.json";
import navigation from "./navigation.json";
import onboarding from "./onboarding.json";
import retirement from "./retirement.json";
import settings from "./settings.json";
import strategies from "./strategies.json";
import worldMap from "./worldMap.json";

const ptPT = {
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
  teams,
} satisfies Messages;

export default ptPT;
