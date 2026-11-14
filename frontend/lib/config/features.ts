/**
 * Feature flags for planned UI (sidebar and user-menu entries, "coming soon"
 * category cards). All off unless listed in NEXT_PUBLIC_FEATURES; see
 * services/features/featureFlags.ts for the flag names.
 */
import {
  parseFeatureFlags,
  type FeatureFlag,
} from "@/../services/features/featureFlags";

export type { FeatureFlag } from "@/../services/features/featureFlags";
export { filterByFeature, filterMenuByFeature } from "@/../services/features/featureFlags";

export const FEATURES = parseFeatureFlags(process.env.NEXT_PUBLIC_FEATURES);

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  return FEATURES[flag];
}
