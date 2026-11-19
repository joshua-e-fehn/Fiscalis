// ═══════════════════════════════════════════════════════════════
// World Bank Dynamic Indicator Types
// For searching and using any World Bank indicator
// ═══════════════════════════════════════════════════════════════

/**
 * World Bank indicator search result from their API
 */
export interface WorldBankIndicatorSearchResult {
  id: string; // e.g., "NY.GDP.MKTP.CD"
  name: string; // e.g., "GDP (current US$)"
  source: {
    id: string;
    value: string;
  };
  sourceNote: string; // Description
  sourceOrganization: string;
  topics?: Array<{
    id: string;
    value: string;
  }>;
}

/**
 * Simplified indicator info for UI display
 */
export interface SearchedIndicator {
  code: string; // World Bank indicator code (e.g., "NY.GDP.MKTP.CD")
  name: string;
  description: string;
  source: string;
  topics: string[];
}

/**
 * Topic from World Bank API
 */
export interface WorldBankTopic {
  id: string;
  value: string;
  sourceNote: string;
}
