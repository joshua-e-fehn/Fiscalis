import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

// ═══════════════════════════════════════════════════════════════
// ONBOARDING HOOKS
// ═══════════════════════════════════════════════════════════════

/**
 * Get onboarding progress for current user
 */
export function useOnboardingProgress() {
  return useQuery(api.onboarding.getOnboardingProgress);
}

/**
 * Check if user has completed onboarding
 */
export function useHasCompletedOnboarding() {
  return useQuery(api.onboarding.hasCompletedOnboarding);
}

/**
 * Get user settings
 */
export function useUserSettings() {
  return useQuery(api.onboarding.getUserSettings);
}

/**
 * Get connection summary (banking, broker, crypto counts)
 */
export function useConnectionSummary() {
  return useQuery(api.onboarding.getConnectionSummary);
}

/**
 * Initialize onboarding for new user
 */
export function useInitializeOnboarding() {
  return useMutation(api.onboarding.initializeOnboarding);
}

/**
 * Update current onboarding step
 */
export function useUpdateOnboardingStep() {
  return useMutation(api.onboarding.updateOnboardingStep);
}

/**
 * Skip a step in onboarding
 */
export function useSkipStep() {
  return useMutation(api.onboarding.skipStep);
}

/**
 * Mark profile step as completed
 */
export function useCompleteProfileStep() {
  return useMutation(api.onboarding.completeProfileStep);
}

/**
 * Update connection status (banking/brokers/crypto)
 */
export function useUpdateConnectionStatus() {
  return useMutation(api.onboarding.updateConnectionStatus);
}

/**
 * Mark onboarding as complete
 */
export function useCompleteOnboarding() {
  return useMutation(api.onboarding.completeOnboarding);
}

/**
 * Save user settings
 */
export function useSaveUserSettings() {
  return useMutation(api.onboarding.saveUserSettings);
}

/**
 * Set just the user's date of birth (lightweight upsert)
 */
export function useSetBirthDate() {
  return useMutation(api.onboarding.setBirthDate);
}
