/**
 * The in-app documentation under /docs: which pages exist, in what order,
 * and where a section's "open" link goes. The text lives in
 * messages/<lang>/docs.json; the page titles are the sidebar labels
 * (navigation.sidebar.items).
 */
import type { Messages } from "@/i18n/messages";

/** Pages in reading order; also the key of each page's title in the sidebar. */
export const DOC_PAGES = ["introduction", "getStarted", "tutorials", "changelog"] as const;
export type DocPage = (typeof DOC_PAGES)[number];

export const DOC_ROUTES: Record<DocPage, string> = {
  introduction: "/docs/introduction",
  getStarted: "/docs/get-started",
  tutorials: "/docs/tutorials",
  changelog: "/docs/changelog",
};

/** The pages whose body is a list of sections in the "docs" catalogue. */
export type DocSectionPage = Exclude<DocPage, "changelog">;

type SectionKey<P extends DocSectionPage> = keyof Messages["docs"][P]["sections"];

/**
 * Where a section's link points; the label is the section's `linkLabel`.
 * Typed against the English catalogue, so a renamed section fails tsc.
 */
export const DOC_SECTION_LINKS: { [P in DocSectionPage]: Partial<Record<SectionKey<P>, string>> } = {
  introduction: {
    sources: DOC_ROUTES.getStarted,
    netWorth: "/dashboard",
    currency: "/settings/general",
    privacy: "/settings/privacy",
  },
  getStarted: {
    profile: "/settings/general",
    connect: "/integrations/banking",
    manual: DOC_ROUTES.tutorials,
    explore: "/dashboard",
  },
  tutorials: {
    connectBank: "/integrations/banking",
    connectBroker: "/integrations/brokers",
    manualAsset: "/assets/real-estate",
    vaultPurchase: "/assets/commodities/metals",
    loan: "/liabilities/loans",
    apiKey: "/settings/api-keys",
  },
};
