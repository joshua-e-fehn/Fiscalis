import { DocsPage, docsMetadata } from "@/components/atomic/organisms/docs/docsPage";

export function generateMetadata() {
  return docsMetadata("introduction");
}

/** Text in messages/<lang>/docs.json (introduction). */
export default function IntroductionPage() {
  return <DocsPage page="introduction" />;
}
