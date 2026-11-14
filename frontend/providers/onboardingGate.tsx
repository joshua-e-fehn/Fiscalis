"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useHasCompletedOnboarding } from "@/hooks/convex/onboarding";

/**
 * Keeps every signed-in app page behind the onboarding funnel. Renders a
 * loader until the onboarding status is known (no flash of the app), then
 * either the page or a redirect to /onboarding, where the funnel resumes at
 * the saved step. hasCompletedOnboarding is null while the Convex auth token
 * is still loading, so only an explicit false redirects.
 */
export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const hasCompleted = useHasCompletedOnboarding();

  useEffect(() => {
    if (hasCompleted === false) router.replace("/onboarding");
  }, [hasCompleted, router]);

  if (hasCompleted !== true) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}
