"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { OnboardingFlow } from "@/components/atomic/organisms/onboarding";
import { useHasCompletedOnboarding } from "@/hooks/convex/onboarding";

export default function OnboardingPage() {
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const hasCompleted = useHasCompletedOnboarding();
  // Whether this visit started with onboarding unfinished. Completing it on
  // the final step then does not redirect: the CompletionStep sends the user
  // to the dashboard when they click its button.
  const [startedIncomplete, setStartedIncomplete] = useState(false);
  if (hasCompleted === false && !startedIncomplete) {
    setStartedIncomplete(true);
  }

  // Redirect if not signed in
  useEffect(() => {
    if (isLoaded && !isSignedIn) {
      router.push("/sign-in");
    }
  }, [isLoaded, isSignedIn, router]);

  // Already onboarded: nothing to do here.
  useEffect(() => {
    if (hasCompleted === true && !startedIncomplete) {
      router.replace("/dashboard");
    }
  }, [hasCompleted, startedIncomplete, router]);

  // Don't render until auth and the onboarding status are loaded
  if (!isLoaded || !isSignedIn || !startedIncomplete) {
    return null;
  }

  return <OnboardingFlow />;
}
