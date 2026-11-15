import { DocsPage, docsMetadata } from "@/components/atomic/organisms/docs/docsPage";
import { ChangelogList } from "@/components/atomic/organisms/docs/changelogList";
import changelog from "@/lib/docs/changelog.json";
import type { Changelog } from "@/../services/docs/changelog";

export function generateMetadata() {
  return docsMetadata("changelog");
}

/** Data from `bun run changelog` (scripts/changelog.ts), committed. */
export default function ChangelogPage() {
  return (
    <DocsPage page="changelog">
      <ChangelogList changelog={changelog as Changelog} />
    </DocsPage>
  );
}
