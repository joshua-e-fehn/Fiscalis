import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { BillingSettings } from "@/components/atomic/organisms/settings/BillingSettings";

export default async function BillingSettingsPage() {
  const t = await getTranslations("billing.billing");
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />
      {/* Reads ?checkout= after the Stripe redirect */}
      <Suspense>
        <BillingSettings />
      </Suspense>
    </div>
  );
}
