import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { NotificationSettings } from "@/components/atomic/organisms/settings/NotificationSettings";

export default async function NotificationSettingsPage() {
  const t = await getTranslations("notifications.preferences");
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <NotificationSettings />
    </div>
  );
}
