import { v } from "convex/values";
import { SYNC_PROVIDERS } from "../../../services/health/syncRuns";

/** Validators of the syncRuns table (schema.ts) and its functions. */

// As schema.ts oneOf: the providers are declared once, in services/
export const syncProviderValidator = v.union(
  ...SYNC_PROVIDERS.map((provider) => v.literal(provider)),
);

export const syncTriggerValidator = v.union(
  v.literal("scheduled"),
  v.literal("manual"),
);

export const syncRunStatusValidator = v.union(
  v.literal("running"),
  v.literal("success"),
  v.literal("partial"),
  v.literal("failed"),
);

export const syncOutcomeStatusValidator = v.union(
  v.literal("success"),
  v.literal("partial"),
  v.literal("failed"),
);
