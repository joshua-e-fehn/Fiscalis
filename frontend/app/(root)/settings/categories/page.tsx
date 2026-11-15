import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { CategoryOverridesCard } from "@/components/atomic/organisms/settings/CategoryOverridesCard";

export default async function CategorySettingsPage() {
  const t = await getTranslations("categories.override.list");
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      <CategoryOverridesCard />
    </div>
  );
}
