"use client";

import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { NOTIFICATION_PAGE_SIZE } from "@/../services/notifications/notifications";

/** The header bell: newest notifications and the unread count. */
export function useNotificationBell() {
  return useQuery(api.notifications.bell);
}

/** The Notifications page, newest first, NOTIFICATION_PAGE_SIZE at a time. */
export function useNotificationList() {
  return usePaginatedQuery(
    api.notifications.list,
    {},
    { initialNumItems: NOTIFICATION_PAGE_SIZE },
  );
}

/** Mark one notification read. */
export function useMarkNotificationRead() {
  return useMutation(api.notifications.markRead);
}

/** Mark all of the signed-in user's notifications read. */
export function useMarkAllNotificationsRead() {
  return useMutation(api.notifications.markAllRead);
}

/** Settings > Notifications: every type's channels, and whether email is on. */
export function useNotificationPreferences() {
  return useQuery(api.notifications.preferences);
}

/** Save one type's channels. */
export function useSetNotificationPreference() {
  return useMutation(api.notifications.setPreference);
}
