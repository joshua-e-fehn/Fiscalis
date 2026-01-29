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

/**
 * Dynamic indicator data response
 * Similar to IndicatorData but with flexible indicator info
 */
export interface DynamicIndicatorData {
  indicator: {
    code: string;
    name: string;
    description: string;
    unit: string;
  };
  year: number;
  lastUpdated: string;
  source: "World Bank";
  countries: Array<{
    code: string;
    code3: string;
    name: string;
    value: number | null;
    formattedValue: string;
  }>;
}
