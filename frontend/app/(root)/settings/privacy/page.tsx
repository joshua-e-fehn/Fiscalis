import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { PrivacySettings } from "@/components/atomic/organisms/settings/PrivacySettings";

export default async function PrivacySettingsPage() {
  const t = await getTranslations("settings.privacy");
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <PrivacySettings />
    </div>
  );
}
