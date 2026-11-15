"use client";

import { useTranslations } from "next-intl";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/shadcn/button";
import { useWorkspace } from "@/providers/workspaceProvider";

/** Says the app shows a team's read-only aggregate, with a way back to Personal. */
export function WorkspaceBanner() {
  const t = useTranslations("teams.workspace");
  const { team, select } = useWorkspace();
  if (!team) return null;
  return (
    <div
      role="status"
      className="bg-muted mx-4 mt-2 flex flex-wrap items-center gap-2 rounded-md border px-4 py-2 text-sm"
    >
      <Eye className="size-4 shrink-0" />
      <span>{t("readOnlyBanner", { team: team.name, count: team.sharingCount })}</span>
      <Button className="ms-auto" variant="outline" size="sm" onClick={() => select(null)}>
        {t("personal")}
      </Button>
    </div>
  );
}
