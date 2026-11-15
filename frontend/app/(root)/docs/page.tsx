import { redirect } from "next/navigation";

import { DOC_ROUTES } from "@/lib/config/docs";

/** /docs opens the first page. */
export default function DocsIndexPage() {
  redirect(DOC_ROUTES.introduction);
}
