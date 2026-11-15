"use client";

/**
 * Investment Strategies > Goals (ENG-256): things the user wants to buy,
 * each unlocked by a rule (convex/goals.ts). Active goals first with their
 * progress, then bought and archived ones; the trackers the user attests
 * below; debts left by goals bought before they were earned on top.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Target } from "lucide-react";
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
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { GoalCard } from "@/components/atomic/molecules/strategies/GoalCard";
import {
  GoalEditorDialog,
  type EditableGoal,
} from "@/components/atomic/organisms/strategies/GoalEditorDialog";
import {
  GoalPurchaseDialog,
  useMetricName,
} from "@/components/atomic/organisms/strategies/GoalPurchaseDialog";
import { GoalTrackersPanel } from "@/components/atomic/organisms/strategies/GoalTrackersPanel";
import {
  useArchiveGoal,
  useGoals,
  useRemoveGoal,
  useRestoreGoal,
  type GoalView,
} from "@/hooks/convex/goals";
import { useErrorMessage } from "@/i18n/errors";
import { formatCurrency } from "@/lib/utils/currency";

const ORDER = { active: 0, bought: 1, archived: 2 } as const;

export default function GoalsPage() {
  const t = useTranslations("strategies.goals");
  const tActions = useTranslations("common.actions");
  const errorMessage = useErrorMessage();
  const { data, currency } = useGoals();
  const archiveGoal = useArchiveGoal();
  const restoreGoal = useRestoreGoal();
  const removeGoal = useRemoveGoal();
  const metricName = useMetricName(data?.trackers ?? []);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EditableGoal | undefined>();
  const [buying, setBuying] = useState<GoalView | null>(null);
  const [deleting, setDeleting] = useState<GoalView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openEditor = (goal?: GoalView) => {
    setEditing(
      goal && {
        _id: goal._id,
        name: goal.name,
        description: goal.description,
        currency: goal.currency,
        price: goal.price,
        rule: goal.rule,
      },
    );
    setEditorOpen(true);
  };

  const run = async (action: () => Promise<unknown>, done: string) => {
    try {
      await action();
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    await run(() => removeGoal({ goalId: deleting._id }), t("toast.deleted", { name: deleting.name }));
    setIsDeleting(false);
    setDeleting(null);
  };

  const goals = data ? [...data.goals].sort((a, b) => ORDER[a.status] - ORDER[b.status]) : [];

  return (
    <div className="container mx-auto space-y-6 py-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actionsLoading={data === undefined}
        actions={[{ label: t("newGoal"), onClick: () => openEditor() }]}
      />

      {data && data.debts.length > 0 && (
        <Alert>
          <AlertDescription>
            {data.debts.map((d) => (
              <div key={d.metric}>
                {t("debt", {
                  pool: metricName(d.metric),
                  amount:
                    d.metric === "invested" || d.metric === "gains"
                      ? formatCurrency(d.amount, currency, { fractionDigits: 0 })
                      : String(d.amount),
                })}
              </div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      {data === undefined ? (
        <div className="grid gap-4">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Target className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
              <p className="max-w-lg text-sm text-muted-foreground">{t("empty.description")}</p>
            </div>
            <Button onClick={() => openEditor()}>{t("empty.action")}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {goals.map((goal) => (
            <GoalCard
              key={goal._id}
              goal={goal}
              trackers={data?.trackers ?? []}
              currency={currency}
              onEdit={() => openEditor(goal)}
              onBuy={() => setBuying(goal)}
              onArchive={() =>
                void run(() => archiveGoal({ goalId: goal._id }), t("toast.archived", { name: goal.name }))
              }
              onRestore={() =>
                void run(() => restoreGoal({ goalId: goal._id }), t("toast.restored", { name: goal.name }))
              }
              onDelete={() => setDeleting(goal)}
            />
          ))}
        </div>
      )}

      {data && data.estimatedDays > 0 && (
        <p className="text-xs text-muted-foreground">{t("estimated", { count: data.estimatedDays })}</p>
      )}

      {data && <GoalTrackersPanel trackers={data.trackers} />}

      <GoalEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        goal={editing}
        trackers={data?.trackers ?? []}
        backdateUntil={data?.backdateUntil}
      />
      <GoalPurchaseDialog
        goal={buying}
        trackers={data?.trackers ?? []}
        currency={currency}
        onOpenChange={(open) => !open && setBuying(null)}
      />

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !isDeleting && setDeleting(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("delete.description", { name: deleting?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{tActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
              disabled={isDeleting}
            >
              {isDeleting && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
              {t("delete.confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
