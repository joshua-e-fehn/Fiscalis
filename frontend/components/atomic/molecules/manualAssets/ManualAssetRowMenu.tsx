"use client";

/**
 * ManualAssetRowMenu
 *
 * The row action of a manual asset in a positions table: edit it in the
 * add/edit dialog, or delete it after a confirmation.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
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
import type { Id } from "@/convex/_generated/dataModel";
import {
  useManualAsset,
  useRemoveManualAsset,
} from "@/hooks/convex/manualAssets";
import { useErrorMessage } from "@/i18n/errors";
import { ManualAssetDialog } from "./ManualAssetDialog";

interface ManualAssetRowMenuProps {
  assetId: Id<"manualAssets">;
  name: string;
}

export function ManualAssetRowMenu({ assetId, name }: ManualAssetRowMenuProps) {
  const t = useTranslations("assets.manualAssets");
  const tActions = useTranslations("common.actions");
  const errorMessage = useErrorMessage();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Read only while the edit form is open
  const asset = useManualAsset(editing ? assetId : undefined);
  const remove = useRemoveManualAsset();

  const handleDelete = async () => {
    try {
      await remove({ assetId });
      toast.success(t("toast.deleted", { name }));
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      {/* Not modal, so the dialog opened from it takes focus cleanly */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={t("actionsLabel", { name })}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditing(true)}>
            <Pencil className="mr-2 h-4 w-4" />
            {tActions("edit")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setConfirming(true)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            {tActions("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManualAssetDialog
        // Opens once the asset is read, so the form starts from it
        open={editing && !!asset}
        onOpenChange={setEditing}
        asset={asset ?? undefined}
      />

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteDialog.title", { name })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDialog.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tActions("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {tActions("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
