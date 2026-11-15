import { DocsPage, docsMetadata } from "@/components/atomic/organisms/docs/docsPage";
import {
  API_KEY_RATE_LIMIT,
  MAX_ACTIVE_API_KEYS_PER_USER,
} from "@/../services/apiKeys/apiKeyService";

export function generateMetadata() {
  return docsMetadata("tutorials");
}

/** Code, not prose: the same in every language. */
const API_EXAMPLE = `curl -H "Authorization: Bearer $FISCALIS_API_KEY" \\
  "https://<deployment>.convex.site/api/v1/net-worth?currency=EUR"`;

/** Text in messages/<lang>/docs.json (tutorials). */
export default function TutorialsPage() {
  return (
    <DocsPage
      page="tutorials"
      showContents
      values={{
        maxKeys: String(MAX_ACTIVE_API_KEYS_PER_USER),
        rateLimit: String(API_KEY_RATE_LIMIT.maxRequests),
      }}
      extras={{
        apiKey: (
          <pre className="bg-muted overflow-x-auto rounded-md p-3 text-xs">
            {API_EXAMPLE}
          </pre>
        ),
      }}
    />
  );
}
