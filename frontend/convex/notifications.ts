import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { getOwnedDoc, getUserId, requireUserId } from "./lib/auth";
import { notificationTypeValidator } from "./schema";
import { notify } from "./lib/notifications";
import {
  BELL_LIST_LIMIT,
  NOTIFICATION_MESSAGES,
  MARK_ALL_BATCH,
  NOTIFICATION_RETENTION_MS,
  UNREAD_COUNT_CAP,
  notificationEmailEnabled,
  resolveAllPreferences,
} from "../../services/notifications/notifications";

/**
 * The notification centre (ENG-207): the header bell, the Notifications
 * page and Settings > Notifications. Every public function derives the user
 * from the auth token; a foreign notification id behaves like a missing
 * one. Notifications are written by lib/notifications.ts notify only.
 */

/** What the client gets: no dedupe key, no internal channel flags. */
function forClient(n: Doc<"notifications">) {
  return {
    _id: n._id,
    type: n.type,
    titleKey: n.titleKey,
    bodyKey: n.bodyKey,
    params: n.params,
    link: n.link,
    createdAt: n.createdAt,
    readAt: n.readAt,
  };
}

const EMPTY_PAGE = { page: [], isDone: true, continueCursor: "" };

// ═══════════════════════════════════════════════════════════════
// QUERIES
// ═══════════════════════════════════════════════════════════════

/** The bell: the newest notifications and the unread count (capped). */
export const bell = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return { recent: [], unread: 0 };
    const recent = await ctx.db
      .query("notifications")
      .withIndex("by_user_inApp_created", (q) => q.eq("userId", userId).eq("inApp", true))
      .order("desc")
      .take(BELL_LIST_LIMIT);
    const unread = await ctx.db
      .query("notifications")
      .withIndex("by_user_inApp_read", (q) =>
        q.eq("userId", userId).eq("inApp", true).eq("readAt", undefined),
      )
      .take(UNREAD_COUNT_CAP + 1);
    return { recent: recent.map(forClient), unread: unread.length };
  },
});

/** The Notifications page, newest first (usePaginatedQuery). */
export const list = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    const userId = await getUserId(ctx);
    if (!userId) return EMPTY_PAGE;
    const result = await ctx.db
      .query("notifications")
      .withIndex("by_user_inApp_created", (q) => q.eq("userId", userId).eq("inApp", true))
      .order("desc")
      .paginate(paginationOpts);
    return { ...result, page: result.page.map(forClient) };
  },
});

/**
 * Settings > Notifications: one entry per type (saved or default), and
 * whether this deployment sends email at all.
 */
export const preferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    const saved = userId
      ? await ctx.db
          .query("notificationPreferences")
          .withIndex("by_user", (q) => q.eq("userId", userId))
          .collect()
      : [];
    return {
      types: resolveAllPreferences(saved),
      emailAvailable: notificationEmailEnabled(process.env.NOTIFICATION_EMAIL_ENABLED),
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// MUTATIONS
// ═══════════════════════════════════════════════════════════════

/** Mark one of the caller's notifications read (no-op when already read). */
export const markRead = mutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    const userId = await requireUserId(ctx);
    const notification = await getOwnedDoc(ctx, userId, notificationId);
    if (!notification || notification.readAt !== undefined) return null;
    await ctx.db.patch(notificationId, { readAt: Date.now() });
    return null;
  },
});

async function markUnreadBatch(ctx: MutationCtx, userId: string): Promise<void> {
  const now = Date.now();
  const unread = await ctx.db
    .query("notifications")
    .withIndex("by_user_inApp_read", (q) =>
      q.eq("userId", userId).eq("inApp", true).eq("readAt", undefined),
    )
    .take(MARK_ALL_BATCH);
  for (const n of unread) await ctx.db.patch(n._id, { readAt: now });
  if (unread.length === MARK_ALL_BATCH) {
    await ctx.scheduler.runAfter(0, internal.notifications.markAllReadContinue, { userId });
  }
}

/** Mark all of the caller's notifications read. */
export const markAllRead = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await markUnreadBatch(ctx, await requireUserId(ctx));
    return null;
  },
});

/** The next batch of markAllRead, for users with more unread than a batch. */
export const markAllReadContinue = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await markUnreadBatch(ctx, userId);
    return null;
  },
});

/** Save the caller's channels for one notification type. */
export const setPreference = mutation({
  args: { type: notificationTypeValidator, inApp: v.boolean(), email: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { type, inApp, email }) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("notificationPreferences")
      .withIndex("by_user_type", (q) => q.eq("userId", userId).eq("type", type))
      .first();
    const fields = { inApp, email, updatedAt: Date.now() };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("notificationPreferences", { userId, type, ...fields });
    return null;
  },
});

// ═══════════════════════════════════════════════════════════════
// WRITERS
// ═══════════════════════════════════════════════════════════════

/**
 * notify() for callers without a mutation context: the Stripe webhook
 * handlers in http.ts.
 */
export const notifyUser = internalMutation({
  args: {
    userId: v.string(),
    type: notificationTypeValidator,
    message: v.union(...NOTIFICATION_MESSAGES.map((m) => v.literal(m))),
    params: v.optional(v.record(v.string(), v.union(v.string(), v.number()))),
    link: v.optional(v.string()),
    dedupeKey: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { userId, ...content }) => {
    await notify(ctx, userId, content);
    return null;
  },
});

// ═══════════════════════════════════════════════════════════════
// RETENTION
// ═══════════════════════════════════════════════════════════════

/** Rows deleted per prune mutation; it reschedules itself while more remain. */
const PRUNE_BATCH = 500;

/** Delete notifications older than 90 days (daily cron, crons.ts). */
export const pruneNotifications = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const cutoff = Date.now() - NOTIFICATION_RETENTION_MS;
    const old = await ctx.db
      .query("notifications")
      .withIndex("by_created", (q) => q.lt("createdAt", cutoff))
      .take(PRUNE_BATCH);
    for (const n of old) await ctx.db.delete(n._id);
    if (old.length === PRUNE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.notifications.pruneNotifications, {});
    }
    return old.length;
  },
});
