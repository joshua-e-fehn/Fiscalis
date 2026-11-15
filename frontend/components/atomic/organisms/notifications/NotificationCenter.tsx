"use client";

/**
 * The Notifications page (ENG-207): every notification, newest first, a
 * page at a time, with "mark all as read".
 */

import Link from "next/link";
import { CheckCheck, Loader2, Settings2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Separator } from "@/components/ui/shadcn/separator";
import { NotificationItem } from "@/components/atomic/molecules/notificationItem";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotificationList,
} from "@/hooks/convex";
import { NOTIFICATION_PAGE_SIZE } from "@/../services/notifications/notifications";

export function NotificationCenter() {
  const t = useTranslations("notifications.center");
  const { results, status, loadMore } = useNotificationList();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const anyUnread = results.some((n) => n.readAt === undefined);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" asChild>
          <Link href="/settings/notifications">
            <Settings2 className="me-2 size-4" />
            {t("settings")}
          </Link>
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!anyUnread}
          onClick={() => void markAllRead({})}
        >
          <CheckCheck className="me-2 size-4" />
          {t("markAllRead")}
        </Button>
      </div>
      <Card>
        <CardContent className="pt-4">
          {status === "LoadingFirstPage" ? (
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          ) : results.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">{t("empty")}</p>
          ) : (
            results.map((n, i) => (
              <div key={n._id}>
                {i > 0 && <Separator />}
                <NotificationItem
                  notification={n}
                  onMarkRead={(notificationId) => void markRead({ notificationId })}
                />
              </div>
            ))
          )}
          {status === "CanLoadMore" && (
            <div className="flex justify-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => loadMore(NOTIFICATION_PAGE_SIZE)}>
                {t("loadMore")}
              </Button>
            </div>
          )}
          {status === "LoadingMore" && (
            <Loader2 className="text-muted-foreground mx-auto size-5 animate-spin" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
