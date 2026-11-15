"use client";

/**
 * Investment Strategies > Pies (ENG-189): the user's target allocations,
 * each with target vs actual weight and drift per slice, and the editor to
 * create, change and delete them (convex/pies.ts).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, PieChart } from "lucide-react";
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
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { PageHeader } from "@/components/atomic/molecules/investments";
import { PieCard } from "@/components/atomic/molecules/strategies/PieCard";
import {
  PieEditorDialog,
  type EditablePie,
} from "@/components/atomic/organisms/strategies/PieEditorDialog";
import { usePies, useRemovePie, type PieView } from "@/hooks/convex/pies";
import { useErrorMessage } from "@/i18n/errors";

/** The stored fields of a listed pie, for the editor. */
function toEditable(pie: PieView): EditablePie {
  return {
    _id: pie._id,
    name: pie.name,
    description: pie.description,
    slices: pie.slices.map(({ label, weight, target }) => ({ label, weight, target })),
  };
}

export default function PiesPage() {
  const t = useTranslations("strategies.pies");
  const tActions = useTranslations("common.actions");
  const errorMessage = useErrorMessage();
  const { pies, currency } = usePies();
  const removePie = useRemovePie();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<EditablePie | undefined>();
  const [deleting, setDeleting] = useState<PieView | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openEditor = (pie?: PieView) => {
    setEditing(pie ? toEditable(pie) : undefined);
    setEditorOpen(true);
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await removePie({ pieId: deleting._id });
      toast.success(t("toast.deleted", { name: deleting.name }));
      setDeleting(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 py-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actionsLoading={pies === undefined}
        actions={[{ label: t("newPie"), onClick: () => openEditor() }]}
      />

      {pies === undefined ? (
        <div className="grid gap-4">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : pies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <PieChart className="h-10 w-10 text-muted-foreground" />
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">{t("empty.title")}</h2>
              <p className="max-w-lg text-sm text-muted-foreground">
                {t("empty.description")}
              </p>
            </div>
            <Button onClick={() => openEditor()}>{t("empty.action")}</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pies.map((pie) => (
            <PieCard
              key={pie._id}
              pie={pie}
              currency={currency}
              onEdit={() => openEditor(pie)}
              onDelete={() => setDeleting(pie)}
            />
          ))}
        </div>
      )}

      <PieEditorDialog open={editorOpen} onOpenChange={setEditorOpen} pie={editing} />

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
