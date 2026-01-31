"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OnboardingFlow } from "@/components/atomic/organisms/onboarding";
import { useHasCompletedOnboarding } from "@/hooks/convex/onboarding";

export default function OnboardingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const hasCompleted = useHasCompletedOnboarding();

  // Redirect if not signed in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Note: We don't auto-redirect on completion here anymore.
  // The CompletionStep handles the redirect when user clicks the button.
  // This only redirects users who return to /onboarding after already completing it.
  useEffect(() => {
    // Only redirect if they completed onboarding in a previous session
    // and are trying to access the onboarding page again
    if (hasCompleted === true && typeof window !== "undefined") {
      const isReturningUser =
        sessionStorage.getItem("onboarding_in_progress") !== "true";
      if (isReturningUser) {
        router.push("/dashboard");
      }
    }
  }, [hasCompleted, router]);

  // Mark that onboarding is in progress for this session
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      sessionStorage.setItem("onboarding_in_progress", "true");
    }
  }, [isLoaded, isSignedIn]);

  // Don't render until auth is loaded
  if (!isLoaded || !isSignedIn) {
    return null;
  }

  return <OnboardingFlow />;
}
