import {
  LegalPage,
  legalMetadata,
} from "@/components/atomic/organisms/legal/legalPage";

export function generateMetadata() {
  return legalMetadata("privacy");
}

/** Public route (proxy.ts); text in messages/<lang>/legal.json. */
export default function PrivacyPage() {
  return <LegalPage page="privacy" />;
}
