import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { GeneralSettingsForm } from "@/components/atomic/organisms/settings/GeneralSettingsForm";

export default async function GeneralSettingsPage() {
  const t = await getTranslations("settings.general");
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />
      <GeneralSettingsForm />
    </div>
  );
}
