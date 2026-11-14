import { PageHeader } from "@/components/atomic/molecules/investments/PageHeader";
import { GeneralSettingsForm } from "@/components/atomic/organisms/settings/GeneralSettingsForm";

export default function GeneralSettingsPage() {
  return (
    <div className="flex flex-col gap-6 pb-10">
      <PageHeader
        title="General"
        subtitle="Your profile, display currency, language and theme."
      />
      <GeneralSettingsForm />
    </div>
  );
}
