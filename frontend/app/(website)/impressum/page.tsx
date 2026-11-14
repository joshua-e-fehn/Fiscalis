import {
  LegalPage,
  legalMetadata,
} from "@/components/atomic/organisms/legal/legalPage";

export function generateMetadata() {
  return legalMetadata("impressum");
}

/** Public route (proxy.ts); text in messages/<lang>/legal.json. */
export default function ImpressumPage() {
  return <LegalPage page="impressum" showLastUpdated={false} />;
}
