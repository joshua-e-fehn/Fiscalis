"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Loader2, Monitor, Moon, Sun } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { cn } from "@/lib/utils";
import { todayLocalISO, validateBirthDate } from "@/lib/utils/date";
import {
  CURRENCIES,
  LANGUAGES,
  type Currency,
  type Language,
  type ProfileFormData,
  type Theme,
} from "@/lib/types/onboarding";
import { useUpdateSettings, useUserSettings } from "@/hooks/convex/onboarding";
import { SUPPORTED_DISPLAY_CURRENCIES } from "@/hooks/convex/displayCurrency";
import { MAX_DISPLAY_NAME_LENGTH } from "@/../services/settings/userSettings";

const THEME_OPTIONS: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Currencies figures can be shown in today (the rest are listed, disabled). */
function isSelectableCurrency(currency: Currency): boolean {
  return SUPPORTED_DISPLAY_CURRENCIES.some((c) => c === currency);
}

type StoredSettings = NonNullable<ReturnType<typeof useUserSettings>>;

function toFormData(settings: StoredSettings | null): ProfileFormData {
  return {
    displayName: settings?.displayName ?? "",
    birthDate: settings?.birthDate ?? "",
    defaultCurrency: (settings?.defaultCurrency as Currency) ?? "EUR",
    language: (settings?.language as Language) ?? "en",
    theme: settings?.theme ?? "system",
  };
}

/**
 * Settings > General: display name, date of birth, display currency, language
 * and theme. Saves through onboarding.updateSettings; the theme previews live
 * and reverts to the saved one when the page is left unsaved.
 */
export function GeneralSettingsForm() {
  const settings = useUserSettings();

  if (settings === undefined) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return <GeneralSettingsFields initial={toFormData(settings)} />;
}

function GeneralSettingsFields({ initial }: { initial: ProfileFormData }) {
  const updateSettings = useUpdateSettings();
  const { setTheme } = useTheme();

  const [formData, setFormData] = useState<ProfileFormData>(initial);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // Theme to restore on leaving the page: the preview is not a saved choice.
  const savedTheme = useRef<Theme>(initial.theme);
  useEffect(() => {
    const restore = savedTheme;
    return () => setTheme(restore.current);
  }, [setTheme]);

  const birthDateCheck = formData.birthDate
    ? validateBirthDate(formData.birthDate)
    : null;
  const birthDateError =
    birthDateCheck && !birthDateCheck.ok ? birthDateCheck.error : null;

  const update = (patch: Partial<ProfileFormData>) => {
    setSaved(false);
    setFormData((prev) => ({ ...prev, ...patch }));
  };

  const selectTheme = (theme: Theme) => {
    update({ theme });
    setTheme(theme);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (birthDateError) return;
    setSaveError(null);
    setIsSaving(true);
    try {
      await updateSettings({
        displayName: formData.displayName,
        birthDate: birthDateCheck?.ok ? birthDateCheck.value : "",
        defaultCurrency: formData.defaultCurrency,
        language: formData.language,
        theme: formData.theme,
      });
      savedTheme.current = formData.theme;
      setSaved(true);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveError("We couldn't save your settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How Fiscalis addresses you.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-display-name">Display name</Label>
            <Input
              id="settings-display-name"
              placeholder="Your name"
              value={formData.displayName}
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              onChange={(e) => update({ displayName: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="settings-birth-date">Date of birth</Label>
            <Input
              id="settings-birth-date"
              type="date"
              value={formData.birthDate}
              max={todayLocalISO()}
              onChange={(e) => update({ birthDate: e.target.value })}
              aria-invalid={!!birthDateError}
              className="sm:w-60"
            />
            {birthDateError ? (
              <p role="alert" className="text-destructive text-xs">
                {birthDateError}
              </p>
            ) : (
              <p className="text-muted-foreground text-xs">
                Optional. Used by planning tools such as the retirement
                planner.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Region</CardTitle>
          <CardDescription>Currency and language.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 sm:flex-row">
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="settings-currency">Display currency</Label>
            <Select
              value={formData.defaultCurrency}
              onValueChange={(value: Currency) =>
                update({ defaultCurrency: value })
              }
            >
              <SelectTrigger id="settings-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((currency) => (
                  <SelectItem
                    key={currency.value}
                    value={currency.value}
                    disabled={!isSelectableCurrency(currency.value)}
                  >
                    {currency.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">
              Figures are shown in euros for now. US dollar, British pound and
              Swiss franc are coming soon.
            </p>
          </div>
          <div className="flex flex-1 flex-col gap-2">
            <Label htmlFor="settings-language">Language</Label>
            <Select
              value={formData.language}
              onValueChange={(value: Language) => update({ language: value })}
            >
              <SelectTrigger id="settings-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((language) => (
                  <SelectItem key={language.value} value={language.value}>
                    {language.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            System follows your device setting.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="grid grid-cols-3 gap-3 sm:max-w-md"
          >
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
              const selected = formData.theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectTheme(value)}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-3 text-sm transition-colors",
                    selected
                      ? "border-primary bg-primary/5"
                      : "hover:bg-muted border-border",
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSaving || !!birthDateError}>
          {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
        {saved && (
          <span className="text-muted-foreground flex items-center gap-1 text-sm">
            <Check className="h-4 w-4" />
            Saved
          </span>
        )}
        {saveError && (
          <p role="alert" className="text-destructive text-sm">
            {saveError}
          </p>
        )}
      </div>
    </form>
  );
}
