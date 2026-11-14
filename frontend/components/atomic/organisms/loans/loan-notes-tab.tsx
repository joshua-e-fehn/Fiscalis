"use client";

import { useState, useEffect, useCallback } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Doc } from "@/convex/_generated/dataModel";
import { useUpdateLoan } from "@/hooks/convex/loans";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Textarea } from "@/components/ui/shadcn/textarea";
import { Button } from "@/components/ui/shadcn/button";
import { Badge } from "@/components/ui/shadcn/badge";
import { FileText, Save, Clock, Check } from "lucide-react";

type Loan = Doc<"loans">;

interface LoanNotesTabProps {
  loan: Loan;
}

const TIPS = [
  "reference",
  "conditions",
  "contact",
  "modifications",
  "reminders",
] as const;

export function LoanNotesTab({ loan }: LoanNotesTabProps) {
  const t = useTranslations("loans.notes");
  const tLoans = useTranslations("loans");
  const format = useFormatter();
  // Re-renders the "Saved 5 minutes ago" badge as time passes
  const now = useNow({ updateInterval: 30_000 });
  // Dates are calendar-only YYYY-MM-DD strings, which parse as UTC midnight
  const formatDate = (date: string) =>
    format.dateTime(new Date(date), "dateOnly");
  const [notes, setNotes] = useState(loan.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { updateLoan } = useUpdateLoan();

  // Track changes
  useEffect(() => {
    setHasUnsavedChanges(notes !== (loan.notes || ""));
  }, [notes, loan.notes]);

  // Auto-save with debounce
  const saveNotes = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      await updateLoan({
        loanId: loan._id,
        notes,
      });
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error("Failed to save notes:", error);
    } finally {
      setIsSaving(false);
    }
  }, [loan._id, notes, hasUnsavedChanges, updateLoan]);

  // Auto-save after 2 seconds of no typing
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const timer = setTimeout(() => {
      saveNotes();
    }, 2000);

    return () => clearTimeout(timer);
  }, [notes, hasUnsavedChanges, saveNotes]);

  // Handle manual save
  const handleManualSave = () => {
    saveNotes();
  };

  // "Saved just now", "Saved 5 minutes ago", then the time of day
  const formatLastSaved = (saved: Date) => {
    const diff = Math.floor((now.getTime() - saved.getTime()) / 1000);

    if (diff < 60) return t("savedJustNow");
    if (diff < 3600) {
      return t("savedAgo", {
        when: format.relativeTime(saved, { now, unit: "minute" }),
      });
    }
    return t("savedAt", {
      time: format.dateTime(saved, { hour: "2-digit", minute: "2-digit" }),
    });
  };

  return (
    <div className="space-y-6">
      {/* Notes Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                {t("title")}
              </CardTitle>
              <CardDescription>{t("description")}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isSaving && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3 animate-spin" />
                  {t("saving")}
                </Badge>
              )}
              {!isSaving && lastSaved && !hasUnsavedChanges && (
                <Badge variant="secondary" className="gap-1 text-green-600">
                  <Check className="h-3 w-3" />
                  {formatLastSaved(lastSaved)}
                </Badge>
              )}
              {hasUnsavedChanges && !isSaving && (
                <Badge variant="outline" className="gap-1">
                  {t("unsaved")}
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={t("placeholder")}
            className="min-h-[300px] font-mono text-sm"
          />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {t("autoSaveHint")}
            </p>
            <Button
              onClick={handleManualSave}
              disabled={!hasUnsavedChanges || isSaving}
              variant="outline"
            >
              <Save className="h-4 w-4 mr-2" />
              {t("saveNow")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("contractDetails")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("lender")}</span>
              <span className="font-medium">
                {loan.lender || t("notSpecified")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("loanType")}</span>
              <span className="font-medium">
                {tLoans(`loanTypes.${loan.loanType}.label`)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("startDate")}</span>
              <span className="font-medium">{formatDate(loan.startDate)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("expectedEnd")}</span>
              <span className="font-medium">
                {formatDate(loan.expectedEndDate)}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("prepaymentTerms")}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {t("maxPrepayment")}
              </span>
              <span className="font-medium">
                {loan.maxAnnualPrepaymentRate !== undefined
                  ? `${(loan.maxAnnualPrepaymentRate * 100).toFixed(1)}%`
                  : t("noLimit")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">{t("penaltyRate")}</span>
              <span className="font-medium">
                {loan.prepaymentPenaltyRate
                  ? `${(loan.prepaymentPenaltyRate * 100).toFixed(1)}%`
                  : t("none")}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tips */}
      <Card className="border-dashed">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <FileText className="h-4 w-4 text-blue-600" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm">{t("tipsTitle")}</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                {TIPS.map((tip) => (
                  <li key={tip}>• {t(`tips.${tip}`)}</li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
