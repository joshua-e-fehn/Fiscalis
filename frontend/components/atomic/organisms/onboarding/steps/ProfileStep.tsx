"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useUser } from "@clerk/nextjs";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import {
  User,
  Globe,
  Palette,
  ArrowRight,
  ArrowLeft,
  Check,
  CalendarDays,
} from "lucide-react";
import { OnboardingButton } from "../shared/OnboardingButton";
import {
  OnboardingCard,
  OnboardingCardContent,
} from "../shared/OnboardingCard";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { cn } from "@/lib/utils";
import { todayLocalISO, validateBirthDate } from "@/lib/utils/date";
import { toDisplayCurrency } from "@/../services/finance/displayCurrency";
import {
  ProfileFormData,
  Currency,
  Language,
  Theme,
  CURRENCIES,
  LANGUAGES,
  containerVariants,
  itemVariants,
} from "@/lib/types/onboarding";
import {
  useSaveUserSettings,
  useUserSettings,
  useCompleteProfileStep,
} from "@/hooks/convex/onboarding";
import { languageForLocale } from "@/i18n/locales";

interface ProfileStepProps {
  onNext: () => void;
  onBack: () => void;
}

export function ProfileStep({ onNext, onBack }: ProfileStepProps) {
  const { user } = useUser();
  const saveSettings = useSaveUserSettings();
  const completeProfile = useCompleteProfileStep();
  const existingSettings = useUserSettings();
  const { setTheme } = useTheme();
  const t = useTranslations("onboarding.profile");
  const tActions = useTranslations("common.actions");
  const tLanguage = useTranslations("common.language");
  const tErrors = useTranslations("common.errors");
  // Preselect the language the app is shown in (cookie or browser language,
  // limited to RENDERED_LANGUAGES, so English until German is rendered)
  const currentLanguage = languageForLocale(useLocale());

  const [formData, setFormData] = useState<ProfileFormData>({
    displayName: "",
    birthDate: "",
    defaultCurrency: "EUR",
    language: currentLanguage,
    // Same default as ThemeProvider and the server-side insert defaults
    theme: "system",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  // An empty date of birth is fine (optional); a filled one must be valid.
  const birthDateCheck = formData.birthDate
    ? validateBirthDate(formData.birthDate)
    : null;
  const birthDateError =
    birthDateCheck && !birthDateCheck.ok
      ? tErrors(`birthDate.${birthDateCheck.code}`)
      : null;

  // Pre-fill from Clerk user and existing settings
  useEffect(() => {
    if (user || existingSettings) {
      setFormData((prev) => ({
        ...prev,
        displayName:
          existingSettings?.displayName ||
          user?.fullName ||
          user?.firstName ||
          prev.displayName,
        birthDate: existingSettings?.birthDate || prev.birthDate,
        defaultCurrency:
          toDisplayCurrency(existingSettings?.defaultCurrency) ??
          prev.defaultCurrency,
        language: (existingSettings?.language as Language) || prev.language,
        theme: existingSettings?.theme || prev.theme,
      }));
    }
  }, [user, existingSettings]);

  // Live preview of the chosen theme; saved with the rest of the profile
  const selectTheme = (theme: Theme) => {
    setFormData((prev) => ({ ...prev, theme }));
    setTheme(theme);
  };

  const handleSubmit = async () => {
    if (birthDateError) return;
    setSaveFailed(false);
    setIsSaving(true);
    try {
      await saveSettings({
        displayName: formData.displayName || undefined,
        birthDate: birthDateCheck?.ok ? birthDateCheck.value : undefined,
        defaultCurrency: formData.defaultCurrency,
        language: formData.language,
        theme: formData.theme,
      });
      await completeProfile();
      // LocaleSync switches the UI to the saved language
      onNext();
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveFailed(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-4 py-8">
      <motion.div
        className="w-full max-w-md mx-auto"
        variants={containerVariants}
        initial="initial"
        animate="animate"
      >
        {/* Header */}
        <motion.div className="text-center mb-8" variants={itemVariants}>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[#3B82F6]/10 border border-[#3B82F6]/20 mb-4">
            <User className="w-8 h-8 text-[#3B82F6]" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">{t("title")}</h2>
          <p className="text-white/50">{t("subtitle")}</p>
        </motion.div>

        {/* Form Card */}
        <OnboardingCard glow="blue" className="mb-6">
          <OnboardingCardContent className="space-y-6">
            {/* Display Name */}
            <motion.div variants={itemVariants} className="space-y-2">
              <Label htmlFor="displayName" className="text-white/70">
                {t("displayName")}
              </Label>
              <Input
                id="displayName"
                placeholder={t("displayNamePlaceholder")}
                value={formData.displayName}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    displayName: e.target.value,
                  }))
                }
                className="bg-white/[0.03] border-white/[0.1] text-white placeholder:text-white/30 focus:border-[#3B82F6]/50 focus:ring-[#3B82F6]/20"
              />
            </motion.div>

            {/* Date of Birth */}
            <motion.div variants={itemVariants} className="space-y-2">
              <Label htmlFor="birthDate" className="text-white/70">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4" />
                  {t("birthDate")}
                </div>
              </Label>
              <Input
                id="birthDate"
                type="date"
                value={formData.birthDate}
                max={todayLocalISO()}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    birthDate: e.target.value,
                  }))
                }
                aria-invalid={!!birthDateError}
                className="bg-white/[0.03] border-white/[0.1] text-white placeholder:text-white/30 focus:border-[#3B82F6]/50 focus:ring-[#3B82F6]/20 [color-scheme:dark]"
              />
              {birthDateError ? (
                <p role="alert" className="text-xs text-red-400">
                  {birthDateError}
                </p>
              ) : (
                <p className="text-xs text-white/40">{t("birthDateHint")}</p>
              )}
            </motion.div>

            {/* Currency */}
            <motion.div variants={itemVariants} className="space-y-2">
              <Label htmlFor="currency" className="text-white/70">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4" />
                  {t("currency")}
                </div>
              </Label>
              <Select
                value={formData.defaultCurrency}
                onValueChange={(value: Currency) =>
                  setFormData((prev) => ({ ...prev, defaultCurrency: value }))
                }
              >
                <SelectTrigger className="bg-white/[0.03] border-white/[0.1] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1f] border-white/[0.1]">
                  {CURRENCIES.map((currency) => (
                    <SelectItem
                      key={currency.value}
                      value={currency.value}
                      className="text-white hover:bg-white/[0.05]"
                    >
                      <span className="flex items-center gap-2">
                        <span>{currency.flag}</span>
                        <span>{t(`currencies.${currency.value}`)}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>

            {/* Language */}
            <motion.div variants={itemVariants} className="space-y-2">
              <Label htmlFor="language" className="text-white/70">
                {tLanguage("label")}
              </Label>
              <Select
                value={formData.language}
                onValueChange={(value: Language) =>
                  setFormData((prev) => ({ ...prev, language: value }))
                }
              >
                <SelectTrigger className="bg-white/[0.03] border-white/[0.1] text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#1a1a1f] border-white/[0.1]">
                  {LANGUAGES.map((lang) => (
                    <SelectItem
                      key={lang.value}
                      value={lang.value}
                      className="text-white hover:bg-white/[0.05]"
                    >
                      {lang.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </motion.div>

            {/* Theme */}
            <motion.div variants={itemVariants} className="space-y-3">
              <Label className="text-white/70">
                <div className="flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  {t("theme")}
                </div>
              </Label>
              <div className="grid grid-cols-3 gap-3">
                <ThemeButton
                  selected={formData.theme === "light"}
                  onClick={() => selectTheme("light")}
                  label={t("themes.light")}
                  preview="bg-white"
                />
                <ThemeButton
                  selected={formData.theme === "dark"}
                  onClick={() => selectTheme("dark")}
                  label={t("themes.dark")}
                  preview="bg-[#0a0a0f]"
                />
                <ThemeButton
                  selected={formData.theme === "system"}
                  onClick={() => selectTheme("system")}
                  label={t("themes.system")}
                  preview="bg-gradient-to-r from-white to-[#0a0a0f]"
                />
              </div>
            </motion.div>
          </OnboardingCardContent>
        </OnboardingCard>

        {/* Actions */}
        <motion.div
          className="flex flex-col items-center gap-4"
          variants={itemVariants}
        >
          <OnboardingButton
            onClick={handleSubmit}
            isLoading={isSaving}
            disabled={!!birthDateError}
            size="lg"
            className="w-full"
            icon={<ArrowRight className="w-5 h-5" />}
          >
            {tActions("continue")}
          </OnboardingButton>
          {saveFailed && (
            <p role="alert" className="text-sm text-red-400">
              {t("saveFailed")}
            </p>
          )}
          <OnboardingButton
            onClick={onBack}
            variant="ghost"
            icon={<ArrowLeft className="w-4 h-4" />}
          >
            {tActions("back")}
          </OnboardingButton>
        </motion.div>
      </motion.div>
    </div>
  );
}

interface ThemeButtonProps {
  selected: boolean;
  onClick: () => void;
  label: string;
  preview: string;
}

function ThemeButton({ selected, onClick, label, preview }: ThemeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative p-3 rounded-xl border-2 transition-all duration-200",
        selected
          ? "border-[#3B82F6] bg-[#3B82F6]/10"
          : "border-white/[0.1] bg-white/[0.02] hover:border-white/[0.2]",
      )}
    >
      <div
        className={cn(
          "w-full h-8 rounded-lg mb-2 border border-white/10",
          preview,
        )}
      />
      <span className="text-sm text-white/70">{label}</span>
      {selected && (
        <motion.div
          className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[#3B82F6] flex items-center justify-center"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        >
          <Check className="w-3 h-3 text-white" />
        </motion.div>
      )}
    </button>
  );
}
