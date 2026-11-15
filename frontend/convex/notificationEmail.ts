import { v } from "convex/values";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  catalogueText,
  formatNotificationText,
  notificationEmailEnabled,
} from "../../services/notifications/notifications";
import { isLanguage, type Language } from "../../services/settings/userSettings";
import { describeError } from "../../services/security/providerError";
import en from "../messages/en/notifications.json";
import de from "../messages/de/notifications.json";
import es from "../messages/es/notifications.json";
import fr from "../messages/fr/notifications.json";
import it from "../messages/it/notifications.json";
import ptPT from "../messages/pt-PT/notifications.json";
import ru from "../messages/ru/notifications.json";
import zhHans from "../messages/zh-Hans/notifications.json";
import hi from "../messages/hi/notifications.json";
import ar from "../messages/ar/notifications.json";

/**
 * Email alerts (ENG-207), wired but OFF: nothing is sent until the owner
 * has a sending domain at Resend and sets NOTIFICATION_EMAIL_ENABLED=true,
 * RESEND_API_KEY and NOTIFICATION_EMAIL_FROM (docs/NOTIFICATIONS.md).
 * lib/notifications.ts notify schedules sendNotificationEmail only for a
 * user who opted in to email for the type, and only with the flag on.
 */

const CATALOGUES: Record<Language, unknown> = {
  en,
  de,
  es,
  fr,
  it,
  "pt-PT": ptPT,
  ru,
  "zh-Hans": zhHans,
  hi,
  ar,
};

/**
 * Intl tags for dates and numbers in the email, the same as i18n/locales.ts
 * INTL_TAGS (that module resolves imports through the app's "@/" alias,
 * which the Convex typecheck does not have).
 */
const INTL_TAG: Record<Language, string> = {
  en: "en-GB",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  it: "it-IT",
  "pt-PT": "pt-PT",
  ru: "ru-RU",
  "zh-Hans": "zh-CN",
  hi: "hi-IN",
  ar: "ar-u-nu-latn",
};

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const CLERK_API = "https://api.clerk.com/v1";

/** The notification and the recipient's language, for the email. */
export const emailContext = internalQuery({
  args: { notificationId: v.id("notifications") },
  handler: async (ctx, { notificationId }) => {
    const notification = await ctx.db.get(notificationId);
    if (!notification || notification.emailedAt !== undefined) return null;
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_user", (q) => q.eq("userId", notification.userId))
      .first();
    return {
      userId: notification.userId,
      titleKey: notification.titleKey,
      bodyKey: notification.bodyKey,
      params: notification.params ?? {},
      link: notification.link,
      language: settings?.language,
    };
  },
});

export const markEmailed = internalMutation({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    if (await ctx.db.get(notificationId)) {
      await ctx.db.patch(notificationId, { emailedAt: Date.now() });
    }
    return null;
  },
});

/** The user's primary email address from Clerk, or null. */
async function recipientEmail(userId: string): Promise<string | null> {
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return null;
  const response = await fetch(`${CLERK_API}/users/${encodeURIComponent(userId)}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  if (!response.ok) return null;
  const user = (await response.json()) as {
    primary_email_address_id?: string;
    email_addresses?: { id: string; email_address: string }[];
  };
  const primary = user.email_addresses?.find((e) => e.id === user.primary_email_address_id);
  return primary?.email_address ?? null;
}

/**
 * Resend client stub: sends one email through the Resend REST API, or does
 * nothing (returns "skipped") while RESEND_API_KEY or the sender is unset.
 */
async function sendWithResend(email: {
  to: string;
  subject: string;
  text: string;
}): Promise<"sent" | "skipped"> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_EMAIL_FROM;
  if (!apiKey || !from) return "skipped";
  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [email.to], subject: email.subject, text: email.text }),
  });
  if (!response.ok) throw new Error(`Resend responded ${response.status}`);
  return "sent";
}

/**
 * Email one notification in the recipient's language. A no-op unless
 * NOTIFICATION_EMAIL_ENABLED=true and Resend is configured; never retried
 * (a missed alert is still in the notification centre).
 */
export const sendNotificationEmail = internalAction({
  args: { notificationId: v.id("notifications") },
  returns: v.null(),
  handler: async (ctx, { notificationId }) => {
    if (!notificationEmailEnabled(process.env.NOTIFICATION_EMAIL_ENABLED)) return null;
    const context = await ctx.runQuery(internal.notificationEmail.emailContext, { notificationId });
    if (!context) return null;

    const language: Language =
      context.language && isLanguage(context.language) ? context.language : "en";
    const catalogue = CATALOGUES[language];
    const text = (key: string) =>
      formatNotificationText(
        catalogueText(catalogue, key) ?? catalogueText(en, key) ?? key,
        context.params,
        INTL_TAG[language],
      );

    try {
      const to = await recipientEmail(context.userId);
      if (!to) {
        console.warn("[NOTIFICATIONS] No email address for the recipient; email skipped");
        return null;
      }
      const site = process.env.SITE_URL?.replace(/\/$/, "");
      const link = site ? `${site}${context.link ?? "/notifications"}` : null;
      const body = [
        text(context.bodyKey),
        link ? `${text("email.open")}: ${link}` : null,
        "",
        text("email.footer"),
      ]
        .filter((line) => line !== null)
        .join("\n");
      const result = await sendWithResend({ to, subject: text(context.titleKey), text: body });
      if (result === "sent") {
        await ctx.runMutation(internal.notificationEmail.markEmailed, { notificationId });
      }
    } catch (error) {
      console.error("[NOTIFICATIONS] Email not sent:", describeError(error));
    }
    return null;
  },
});
