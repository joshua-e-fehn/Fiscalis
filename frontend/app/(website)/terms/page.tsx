import {
  LegalPage,
  legalMetadata,
} from "@/components/atomic/organisms/legal/legalPage";

export function generateMetadata() {
  return legalMetadata("terms");
}

/** Public route (proxy.ts); text in messages/<lang>/legal.json. */
export default function TermsPage() {
  return <LegalPage page="terms" />;
}
