"use client";

import { useState, useEffect, useCallback } from "react";
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

export function LoanNotesTab({ loan }: LoanNotesTabProps) {
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

  // Format last saved time
  const formatLastSaved = () => {
    if (!lastSaved) return null;
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastSaved.getTime()) / 1000);

    if (diff < 60) return "Just now";
    if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
    return lastSaved.toLocaleTimeString();
  };

  // Placeholder suggestions
  const placeholderSuggestions = [
    "• Contract reference number: ___",
    "• Lender contact: ___",
    "• Early repayment terms: ___",
    "• Important dates to remember: ___",
    "• Linked collateral or assets: ___",
    "• Special conditions: ___",
  ];

  return (
    <div className="space-y-6">
      {/* Notes Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Contract Notes
              </CardTitle>
              <CardDescription>
                Add any important notes, contract details, or reminders about
                this loan
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {isSaving && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3 animate-spin" />
                  Saving...
                </Badge>
              )}
              {!isSaving && lastSaved && !hasUnsavedChanges && (
                <Badge variant="secondary" className="gap-1 text-green-600">
                  <Check className="h-3 w-3" />
                  Saved {formatLastSaved()}
                </Badge>
              )}
              {hasUnsavedChanges && !isSaving && (
                <Badge variant="outline" className="gap-1">
                  Unsaved changes
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={`Add notes about this loan...\n\n${placeholderSuggestions.join("\n")}`}
            className="min-h-[300px] font-mono text-sm"
          />

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Auto-saves 2 seconds after you stop typing
            </p>
            <Button
              onClick={handleManualSave}
              disabled={!hasUnsavedChanges || isSaving}
              variant="outline"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contract Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Lender</span>
              <span className="font-medium">
                {loan.lender || "Not specified"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Loan Type</span>
              <span className="font-medium capitalize">
                {loan.loanType.replace("_", " ").toLowerCase()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Start Date</span>
              <span className="font-medium">
                {new Date(loan.startDate).toLocaleDateString()}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Expected End</span>
              <span className="font-medium">
                {new Date(loan.expectedEndDate).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Prepayment Terms
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                Max Annual Prepayment
              </span>
              <span className="font-medium">
                {loan.maxAnnualPrepaymentRate
                  ? `${(loan.maxAnnualPrepaymentRate * 100).toFixed(1)}%`
                  : "No limit"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Penalty Rate</span>
              <span className="font-medium">
                {loan.prepaymentPenaltyRate
                  ? `${(loan.prepaymentPenaltyRate * 100).toFixed(1)}%`
                  : "None"}
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
              <p className="font-medium text-sm">
                Tips for Organizing Your Notes
              </p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Store your contract reference number for quick access</li>
                <li>• Note any special conditions or verbal agreements</li>
                <li>• Record contact information for your loan officer</li>
                <li>• Track any modifications made to the original terms</li>
                <li>• Set reminders for rate reviews or renegotiation dates</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
