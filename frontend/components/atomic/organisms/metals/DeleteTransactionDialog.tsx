"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, Loader2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/shadcn/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import type { Transaction } from "@/components/atomic/molecules/metals/TransactionRow";
import type { Id } from "@/convex/_generated/dataModel";
import { useDeleteMetalTransaction } from "@/hooks/convex/metals";
import { useErrorMessage } from "@/i18n/errors";

interface DeleteTransactionDialogProps {
  /** The entry to delete; null closes the dialog */
  transaction: Transaction | null;
  onClose: () => void;
}

/**
 * Confirms deleting one vault ledger entry (ENG-200). The server refuses a
 * delete a later sale or gift relies on (vault.deleteTransaction,
 * deletionConflict); its message is shown here and the dialog stays open.
 * Holdings, cost basis and value update through the live queries.
 */
export function DeleteTransactionDialog({
  transaction,
  onClose,
}: DeleteTransactionDialogProps) {
  const t = useTranslations("metals.deleteTransaction");
  const tActions = useTranslations("common.actions");
  const toErrorMessage = useErrorMessage();
  const deleteTransaction = useDeleteMetalTransaction();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (isDeleting) return;
    setError(null);
    onClose();
  };

  const handleDelete = async () => {
    if (!transaction) return;
    setIsDeleting(true);
    setError(null);
    try {
      await deleteTransaction({
        transactionId: transaction._id as Id<"vaultTransactions">,
      });
      onClose();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsDeleting(false);
    }
  };

  const details = transaction && {
    type: t(`type.${transaction.transactionType}`),
    quantity: transaction.quantity,
    item: transaction.itemName,
  };

  return (
    <AlertDialog
      open={transaction !== null}
      onOpenChange={(open) => !open && close()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("title")}</AlertDialogTitle>
          {transaction && details && (
            <AlertDialogDescription>
              {transaction.transactionDate === null
                ? t("descriptionUndated", details)
                : t("description", {
                    ...details,
                    date: new Date(transaction.transactionDate),
                  })}{" "}
              {t("consequence")}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {tActions("cancel")}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(event) => {
              // Stay open until the server answers, to show a refusal
              event.preventDefault();
              void handleDelete();
            }}
            disabled={isDeleting || error !== null}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {isDeleting && <Loader2 className="h-4 w-4 me-2 animate-spin" />}
            {isDeleting ? t("deleting") : tActions("delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
