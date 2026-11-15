import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { TeamSettings } from "@/components/atomic/organisms/settings/TeamSettings";

export default async function TeamSettingsPage() {
  const t = await getTranslations("teams.page");
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <TeamSettings />
    </div>
  );
}
