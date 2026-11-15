"use client";

/**
 * Settings > Notifications (ENG-207): per alert type, in the app on/off and
 * email on/off. Email is saved even while the deployment does not send it
 * (NOTIFICATION_EMAIL_ENABLED, docs/NOTIFICATIONS.md); a notice says so.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Switch } from "@/components/ui/shadcn/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import {
  useNotificationPreferences,
  useSetNotificationPreference,
} from "@/hooks/convex";
import { useErrorMessage } from "@/i18n/errors";
import type { NotificationType } from "@/../services/notifications/notifications";

export function NotificationSettings() {
  const t = useTranslations("notifications.preferences");
  const preferences = useNotificationPreferences();
  const setPreference = useSetNotificationPreference();
  const errorMessage = useErrorMessage();
  const [error, setError] = useState<string | null>(null);

  if (preferences === undefined) {
    return <Loader2 className="text-muted-foreground size-5 animate-spin" />;
  }

  const save = async (type: NotificationType, inApp: boolean, email: boolean) => {
    setError(null);
    try {
      await setPreference({ type, inApp, email });
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {!preferences.emailAvailable && (
        <p className="text-muted-foreground rounded-md border px-4 py-3 text-sm">
          {t("emailUnavailable")}
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Card>
        <CardContent className="pt-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("alert")}</TableHead>
                <TableHead className="w-28 text-center">{t("inApp")}</TableHead>
                <TableHead className="w-28 text-center">{t("email")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preferences.types.map(({ type, inApp, email }) => (
                <TableRow key={type}>
                  <TableCell>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">{t(`types.${type}.label`)}</span>
                      <span className="text-muted-foreground text-sm">
                        {t(`types.${type}.description`)}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={inApp}
                      aria-label={`${t(`types.${type}.label`)}: ${t("inApp")}`}
                      onCheckedChange={(checked) => void save(type, checked, email)}
                    />
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={email}
                      aria-label={`${t(`types.${type}.label`)}: ${t("email")}`}
                      onCheckedChange={(checked) => void save(type, inApp, checked)}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
