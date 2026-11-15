import { DocsPage, docsMetadata } from "@/components/atomic/organisms/docs/docsPage";

export function generateMetadata() {
  return docsMetadata("getStarted");
}

/** Text in messages/<lang>/docs.json (getStarted). */
export default function GetStartedPage() {
  return <DocsPage page="getStarted" />;
}
