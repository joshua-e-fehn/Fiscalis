"use client";

import Image from "next/image";
import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/shadcn/sidebar";

/**
 * App name and logo at the top of the sidebar. Replaces the team switcher,
 * which showed template sample teams: Fiscalis has no teams yet.
 */
export function NavigationBrand() {
  const t = useTranslations("navigation.brand");
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" asChild>
          <Link href="/dashboard">
            <Image
              src="/fiscalisIcon.svg"
              alt={t("logoAlt")}
              width={35}
              height={35}
              priority
            />
            <span className="truncate text-base font-semibold">Fiscalis</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
