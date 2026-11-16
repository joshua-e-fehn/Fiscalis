import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { NotificationCenter } from "@/components/atomic/organisms/notifications/NotificationCenter";

export default async function NotificationsPage() {
  const t = await getTranslations("notifications.center");
  return (
    <div className="container mx-auto flex flex-col gap-6 pt-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <NotificationCenter />
    </div>
  );
}
