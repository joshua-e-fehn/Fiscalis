"use client";

/**
 * The header bell (ENG-207): unread badge, the newest notifications in a
 * dropdown with "mark all as read", and links to the Notifications page and
 * Settings > Notifications.
 */

import Link from "next/link";
import { Bell, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/shadcn/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/shadcn/dropdown-menu";
import { NotificationItem } from "@/components/atomic/molecules/notificationItem";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationBell,
} from "@/hooks/convex";
import { unreadBadge } from "@/../services/notifications/notifications";

export function NotificationBell() {
  const t = useTranslations("notifications");
  const bell = useNotificationBell();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const unread = bell?.unread ?? 0;
  const badge = unreadBadge(unread);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={unread > 0 ? t("bell.unread", { count: badge }) : t("bell.label")}
        >
          <Bell className="size-5" />
          {badge && (
            <span className="bg-primary text-primary-foreground absolute -end-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none">
              {badge}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <DropdownMenuLabel className="flex items-center justify-between gap-2">
          <span>{t("bell.label")}</span>
          {unread > 0 && (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => void markAllRead({})}
            >
              {t("center.markAllRead")}
            </Button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <div className="max-h-96 overflow-y-auto px-2">
          {bell && bell.recent.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              {t("center.empty")}
            </p>
          ) : (
            bell?.recent.map((n) => (
              <NotificationItem
                key={n._id}
                notification={n}
                compact
                onMarkRead={(notificationId) => void markRead({ notificationId })}
              />
            ))
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/notifications">
            <Bell />
            {t("bell.viewAll")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/settings/notifications">
            <Settings2 />
            {t("center.settings")}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
