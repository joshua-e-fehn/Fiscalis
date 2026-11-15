import { useAction, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/** The signed-in user's plan and where it comes from (null when signed out). */
export function useMyPlan() {
  return useQuery(api.billing.myPlan);
}

/** Settings > Billing: plan, subscription and recent invoices (null when signed out). */
export function useBillingOverview() {
  return useQuery(api.billing.overview);
}

/** Settings > Limits: the plan's limits and current usage. */
export function usePlanUsage() {
  return useQuery(api.billing.usage);
}

/** Starts Stripe Checkout for Pro; returns the URL to redirect to. */
export function useCreateCheckoutSession() {
  return useAction(api.billing.createCheckoutSession);
}

/** Opens the Stripe Customer Portal; returns the URL to redirect to. */
export function useCreatePortalSession() {
  return useAction(api.billing.createPortalSession);
}
