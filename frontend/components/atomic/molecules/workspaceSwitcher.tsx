"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Check, ChevronsUpDown, Settings2, User, Users } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/shadcn/sidebar";
import { useWorkspace } from "@/providers/workspaceProvider";

/**
 * Switches between Personal and the user's teams (ENG-197), below the
 * brand at the top of the sidebar. Hidden until the user is in a team.
 */
export function WorkspaceSwitcher() {
  const t = useTranslations("teams.workspace");
  const { team, teams, select } = useWorkspace();
  const { isMobile } = useSidebar();
  if (teams.length === 0) return null;

  const current = team?.name ?? t("personal");
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" aria-label={t("switchTo")}>
              <span className="bg-sidebar-accent flex size-8 items-center justify-center rounded-md">
                {team ? <Users className="size-4" /> : <User className="size-4" />}
              </span>
              <span className="flex flex-col text-start leading-tight">
                <span className="text-muted-foreground text-xs">{t("label")}</span>
                <span className="truncate font-medium">{current}</span>
              </span>
              <ChevronsUpDown className="ms-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="start"
          >
            <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => select(null)}>
              <User className="size-4" /> {t("personal")}
              {!team && <Check className="ms-auto size-4" />}
            </DropdownMenuItem>
            {teams.map((option) => (
              <DropdownMenuItem key={option.teamId} onSelect={() => select(option.teamId)}>
                <Users className="size-4" /> <span className="truncate">{option.name}</span>
                {team?.teamId === option.teamId && <Check className="ms-auto size-4" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/team">
                <Settings2 className="size-4" /> {t("manage")}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
