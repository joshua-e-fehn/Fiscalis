"use client";

import * as React from "react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { BankTransactions } from "@/components/atomic/organisms/bankTransactions";
import { Alert, AlertDescription } from "@/components/ui/shadcn/alert";
import { Button } from "@/components/ui/shadcn/button";
import { usePlaidItems, useSyncTransactions } from "@/hooks/convex";

type SyncOutcome =
  | { kind: "done"; changed: number }
  | { kind: "partial"; failed: number }
  | { kind: "failed" };

export default function BankTransactionsPage() {
  const t = useTranslations("integrations.banking.transactions");
  const items = usePlaidItems();
  const { mutate: syncTransactions, isLoading: isSyncing } =
    useSyncTransactions();
  const [outcome, setOutcome] = useState<SyncOutcome | null>(null);

  const hasItems = !!items && items.length > 0;

  const sync = async () => {
    setOutcome(null);
    try {
      const result = await syncTransactions();
      setOutcome(
        result.itemsFailed > 0
          ? { kind: "partial", failed: result.itemsFailed }
          : { kind: "done", changed: result.transactionsChanged },
      );
    } catch {
      setOutcome({ kind: "failed" });
    }
  };

  const syncButton = (
    <Button onClick={sync} disabled={isSyncing} size="lg">
      {isSyncing ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <RefreshCw className="mr-2 h-4 w-4" />
      )}
      {isSyncing ? t("syncing") : t("sync")}
    </Button>
  );

  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actionsLoading={items === undefined}
        actions={
          hasItems
            ? [
                {
                  label: t("sync"),
                  onClick: sync,
                  variant: "outline",
                  icon: RefreshCw,
                  isLoading: isSyncing,
                  loadingLabel: t("syncing"),
                },
              ]
            : []
        }
      />

      {outcome && (
        <Alert variant={outcome.kind === "done" ? "default" : "destructive"}>
          {outcome.kind === "done" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>
            {outcome.kind === "done"
              ? t("syncDone", { count: outcome.changed })
              : outcome.kind === "partial"
                ? t("syncPartial", { failed: outcome.failed })
                : t("syncFailed")}
          </AlertDescription>
        </Alert>
      )}

      <BankTransactions syncAction={syncButton} />
    </div>
  );
}
