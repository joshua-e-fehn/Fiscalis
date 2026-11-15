"use client";

/**
 * One notification (ENG-207), as the bell's list and the Notifications page
 * show it: title and body from the `notifications` catalogue (the row holds
 * keys plus params, services/notifications/notifications.ts), when it came
 * in, an unread dot and a "mark as read" button. Opening its link marks it
 * read.
 */

import Link from "next/link";
import { Check } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";

import { Button } from "@/components/ui/shadcn/button";
import { cn } from "@/lib/utils";
import type { Id } from "@/convex/_generated/dataModel";
import {
  messageOfKey,
  paramsForDisplay,
  type NotificationParams,
} from "@/../services/notifications/notifications";

export interface NotificationView {
  _id: Id<"notifications">;
  titleKey: string;
  bodyKey: string;
  params?: NotificationParams;
  link?: string;
  createdAt: number;
  readAt?: number;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function NotificationItem({
  notification,
  onMarkRead,
  compact = false,
}: {
  notification: NotificationView;
  onMarkRead: (id: Id<"notifications">) => void;
  /** The bell's dropdown: smaller text, body clamped to two lines. */
  compact?: boolean;
}) {
  const t = useTranslations("notifications");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const message = messageOfKey(notification.titleKey);
  // A key from a newer deployment than this client: nothing to show
  if (!message) return null;

  const params = paramsForDisplay(notification.params);
  const unread = notification.readAt === undefined;
  const when =
    now.getTime() - notification.createdAt < WEEK_MS
      ? format.relativeTime(notification.createdAt, now)
      : format.dateTime(new Date(notification.createdAt), "date");

  const text = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className={cn("font-medium", compact ? "text-sm" : "text-base")}>
        {t(`messages.${message}.title`, params)}
      </span>
      <span
        className={cn(
          "text-muted-foreground",
          compact ? "line-clamp-2 text-xs" : "text-sm",
        )}
      >
        {t(`messages.${message}.body`, params)}
      </span>
      <span className="text-muted-foreground text-xs">{when}</span>
    </div>
  );

  return (
    <div className="flex items-start gap-3 py-2">
      <span
        aria-hidden
        className={cn(
          "mt-2 size-2 shrink-0 rounded-full",
          unread ? "bg-primary" : "bg-transparent",
        )}
      />
      {unread && <span className="sr-only">{t("center.unreadLabel")}</span>}
      {notification.link ? (
        <Link
          href={notification.link}
          className="flex min-w-0 flex-1 hover:underline"
          onClick={() => unread && onMarkRead(notification._id)}
        >
          {text}
        </Link>
      ) : (
        text
      )}
      {unread && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7 shrink-0"
          aria-label={t("center.markRead")}
          title={t("center.markRead")}
          onClick={() => onMarkRead(notification._id)}
        >
          <Check className="size-4" />
        </Button>
      )}
    </div>
  );
}
