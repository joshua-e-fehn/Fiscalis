import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { UsageLimits } from "@/components/atomic/organisms/settings/UsageLimits";

export default async function LimitsSettingsPage() {
  const t = await getTranslations("billing.limits");
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <UsageLimits />
    </div>
  );
}
