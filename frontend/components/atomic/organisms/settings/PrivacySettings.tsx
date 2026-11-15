"use client";

/**
 * PrivacySettings
 *
 * GDPR self-service (ENG-232): "Download my data" saves the
 * account.exportMyData JSON; "Delete my account" asks for
 * ACCOUNT_DELETE_PHRASE, runs account.deleteMyAccount (provider revocation,
 * then a background purge and Clerk deletion) and signs the user out.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useClerk } from "@clerk/nextjs";
import { Download, Loader2, Trash2 } from "lucide-react";

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
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/shadcn/alert-dialog";
import { useDeleteMyAccount, useExportMyData } from "@/hooks/convex/account";
import { useErrorMessage } from "@/i18n/errors";
import {
  ACCOUNT_DELETE_PHRASE,
  exportFileName,
  isAccountDeleteConfirmation,
} from "@/../services/privacy/userData";

function saveJson(data: unknown, fileName: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function ErrorText({ children }: { children: string }) {
  return (
    <p className="text-destructive text-sm" role="alert">
      {children}
    </p>
  );
}

function ExportCard() {
  const t = useTranslations("settings.privacy.export");
  const exportMyData = useExportMyData();
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    setIsExporting(true);
    try {
      const data = await exportMyData({});
      saveJson(data, exportFileName(new Date()));
    } catch {
      setError(t("failed"));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-3">
        <Button onClick={handleExport} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {isExporting ? t("preparing") : t("button")}
        </Button>
        {error && <ErrorText>{error}</ErrorText>}
      </CardContent>
    </Card>
  );
}

function DeleteAccountCard() {
  const t = useTranslations("settings.privacy.delete");
  const tActions = useTranslations("common.actions");
  const errorMessage = useErrorMessage();
  const deleteMyAccount = useDeleteMyAccount();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = isAccountDeleteConfirmation(confirmation);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmed) return;
    setError(null);
    setIsDeleting(true);
    try {
      await deleteMyAccount({ confirmation });
      await signOut({ redirectUrl: "/" });
    } catch (err) {
      setError(errorMessage(err));
      setIsDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <AlertDialog
          open={open}
          onOpenChange={(next) => {
            if (isDeleting) return;
            setOpen(next);
            if (!next) {
              setConfirmation("");
              setError(null);
            }
          }}
        >
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              {t("button")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <form onSubmit={handleDelete} className="flex flex-col gap-4">
              <AlertDialogHeader>
                <AlertDialogTitle>{t("dialogTitle")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("dialogDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="flex flex-col gap-2">
                <Label htmlFor="delete-account-confirmation">
                  {t("confirmLabel", { phrase: ACCOUNT_DELETE_PHRASE })}
                </Label>
                <Input
                  id="delete-account-confirmation"
                  value={confirmation}
                  onChange={(e) => setConfirmation(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={isDeleting}
                />
              </div>
              {error && <ErrorText>{error}</ErrorText>}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeleting}>
                  {tActions("cancel")}
                </AlertDialogCancel>
                <Button
                  type="submit"
                  variant="destructive"
                  disabled={!confirmed || isDeleting}
                >
                  {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isDeleting ? t("deleting") : t("confirm")}
                </Button>
              </AlertDialogFooter>
            </form>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

export function PrivacySettings() {
  return (
    <div className="flex flex-col gap-6">
      <ExportCard />
      <DeleteAccountCard />
    </div>
  );
}
