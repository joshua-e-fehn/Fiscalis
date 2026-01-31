"use client";

import { useState, useEffect, useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { OnboardingStep as OnboardingStepEnum } from "@/lib/types/onboarding";
import {
  useOnboardingProgress,
  useInitializeOnboarding,
  useUpdateOnboardingStep,
  useSkipStep,
} from "@/hooks/convex/onboarding";
import { AnimatedBackground } from "./shared/AnimatedBackground";
import {
  OnboardingProgress,
  OnboardingProgressCompact,
} from "./OnboardingProgress";
import { OnboardingStep } from "./OnboardingStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import { ProfileStep } from "./steps/ProfileStep";
import { BankingStep } from "./steps/BankingStep";
import { BrokersStep } from "./steps/BrokersStep";
import { CryptoStep } from "./steps/CryptoStep";
import { CompletionStep } from "./steps/CompletionStep";
import { Skeleton } from "@/components/ui/shadcn/skeleton";

export function OnboardingFlow() {
  const progress = useOnboardingProgress();
  const initializeOnboarding = useInitializeOnboarding();
  const updateStep = useUpdateOnboardingStep();
  const skipStep = useSkipStep();

  const [currentStep, setCurrentStep] = useState<OnboardingStepEnum>(
    OnboardingStepEnum.WELCOME,
  );
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [isInitialized, setIsInitialized] = useState(false);

  // Initialize onboarding on first load only
  useEffect(() => {
    if (isInitialized) return; // Already initialized, don't reset
    if (progress === undefined) return; // Still loading

    if (progress === null) {
      // New user, initialize
      initializeOnboarding().then(() => {
        setIsInitialized(true);
      });
    } else {
      // Existing user, restore step only on first load
      setCurrentStep(progress.currentStep as OnboardingStepEnum);
      setIsInitialized(true);
    }
  }, [progress, initializeOnboarding, isInitialized]);

  const goToStep = useCallback(
    async (step: OnboardingStepEnum, markCompleted = true) => {
      setDirection(step > currentStep ? "forward" : "backward");
      setCurrentStep(step);
      await updateStep({ step, markPreviousCompleted: markCompleted });
    },
    [currentStep, updateStep],
  );

  const handleNext = useCallback(() => {
    const nextStep = currentStep + 1;
    if (nextStep <= OnboardingStepEnum.COMPLETION) {
      goToStep(nextStep as OnboardingStepEnum, true);
    }
  }, [currentStep, goToStep]);

  const handleSkip = useCallback(async () => {
    const nextStep = currentStep + 1;
    if (nextStep <= OnboardingStepEnum.COMPLETION) {
      await skipStep({ step: currentStep, nextStep });
      setDirection("forward");
      setCurrentStep(nextStep as OnboardingStepEnum);
    }
  }, [currentStep, skipStep]);

  const handleBack = useCallback(() => {
    const prevStep = currentStep - 1;
    if (prevStep >= OnboardingStepEnum.WELCOME) {
      setDirection("backward");
      setCurrentStep(prevStep as OnboardingStepEnum);
    }
  }, [currentStep]);

  const handleStepClick = useCallback(
    (step: OnboardingStepEnum) => {
      if (step !== currentStep) {
        setDirection(step > currentStep ? "forward" : "backward");
        setCurrentStep(step);
      }
    },
    [currentStep],
  );

  const handleAddMore = useCallback(() => {
    // Go back to banking step to add more connections
    goToStep(OnboardingStepEnum.BANKING, false);
  }, [goToStep]);

  // Loading state
  if (!isInitialized || progress === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <AnimatedBackground />
        <div className="text-center">
          <Skeleton className="w-16 h-16 rounded-2xl mx-auto mb-4 bg-white/5" />
          <Skeleton className="w-48 h-6 mx-auto mb-2 bg-white/5" />
          <Skeleton className="w-32 h-4 mx-auto bg-white/5" />
        </div>
      </div>
    );
  }

  const completedSteps = progress?.completedSteps || [];

  return (
    <div className="min-h-screen relative overflow-y-auto">
      <AnimatedBackground />

      {/* Progress indicator - hide on welcome step */}
      {currentStep !== OnboardingStepEnum.WELCOME && (
        <div className="fixed top-0 left-0 right-0 z-50 px-4 py-6 md:px-8 bg-gradient-to-b from-[#050505] via-[#050505]/80 to-transparent pb-10">
          {/* Desktop progress */}
          <div className="hidden md:block max-w-2xl mx-auto">
            <OnboardingProgress
              currentStep={currentStep}
              completedSteps={completedSteps}
              showLabels={true}
              onStepClick={handleStepClick}
            />
          </div>
          {/* Mobile progress */}
          <div className="md:hidden">
            <OnboardingProgressCompact currentStep={currentStep} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div
        className={`
          ${currentStep !== OnboardingStepEnum.WELCOME ? "pt-24 md:pt-32" : "pt-12 md:pt-16"}
          pb-8 px-4
        `}
      >
        <AnimatePresence mode="wait">
          <OnboardingStep
            key={currentStep}
            stepKey={currentStep}
            direction={direction}
          >
            {currentStep === OnboardingStepEnum.WELCOME && (
              <WelcomeStep onNext={handleNext} />
            )}
            {currentStep === OnboardingStepEnum.PROFILE && (
              <ProfileStep
                onNext={handleNext}
                onSkip={handleSkip}
                onBack={handleBack}
              />
            )}
            {currentStep === OnboardingStepEnum.BANKING && (
              <BankingStep
                onNext={handleNext}
                onSkip={handleSkip}
                onBack={handleBack}
              />
            )}
            {currentStep === OnboardingStepEnum.BROKERS && (
              <BrokersStep
                onNext={handleNext}
                onSkip={handleSkip}
                onBack={handleBack}
              />
            )}
            {currentStep === OnboardingStepEnum.CRYPTO && (
              <CryptoStep
                onNext={handleNext}
                onSkip={handleSkip}
                onBack={handleBack}
              />
            )}
            {currentStep === OnboardingStepEnum.COMPLETION && (
              <CompletionStep onAddMore={handleAddMore} onBack={handleBack} />
            )}
          </OnboardingStep>
        </AnimatePresence>
      </div>
    </div>
  );
}
