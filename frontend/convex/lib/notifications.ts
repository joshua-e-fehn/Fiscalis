import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import {
  bodyKey,
  notificationEmailEnabled,
  resolvePreference,
  titleKey,
  type NotificationContent,
} from "../../../services/notifications/notifications";
import { describeError } from "../../../services/security/providerError";

/**
 * Writes a notification for `userId` (ENG-207), the one way every writer
 * goes: sync status changes (banking.ts, brokers.ts, bitpanda.ts), the
 * daily snapshot (portfolioSnapshots.ts) and the Stripe webhook (http.ts).
 *
 * - The user's preference for the type decides the channels; with both off
 *   nothing is written.
 * - A notification with the same dedupeKey already stored is not written
 *   again (one failed-sync alert per connection per day).
 * - Email is scheduled only when the user opted in and the deployment has
 *   NOTIFICATION_EMAIL_ENABLED=true (docs/NOTIFICATIONS.md).
 *
 * Never throws: a notification must not break the sync or webhook that
 * raised it, so a failure is logged and null returned.
 */
export async function notify(
  ctx: MutationCtx,
  userId: string,
  content: NotificationContent,
): Promise<Id<"notifications"> | null> {
  try {
    const saved = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", content.type))
      .collect();
    const preference = resolvePreference(saved, content.type);
    const email = preference.email && notificationEmailEnabled(process.env.NOTIFICATION_EMAIL_ENABLED);
    if (!preference.inApp && !email) return null;

    if (content.dedupeKey) {
      const existing = await ctx.db
        .query("notifications")
        .withIndex("by_user_dedupe", (q) =>
          q.eq("userId", userId).eq("dedupeKey", content.dedupeKey),
        )
        .first();
      if (existing) return null;
    }

    const id = await ctx.db.insert("notifications", {
      userId,
      type: content.type,
      titleKey: titleKey(content.message),
      bodyKey: bodyKey(content.message),
      ...(content.params ? { params: content.params } : {}),
      ...(content.link ? { link: content.link } : {}),
      ...(content.dedupeKey ? { dedupeKey: content.dedupeKey } : {}),
      inApp: preference.inApp,
      createdAt: Date.now(),
    });
    if (email) {
      await ctx.scheduler.runAfter(0, internal.notificationEmail.sendNotificationEmail, {
        notificationId: id,
      });
    }
    return id;
  } catch (error) {
    console.error(`[NOTIFICATIONS] Could not write a ${content.type} notification:`, describeError(error));
    return null;
  }
}
