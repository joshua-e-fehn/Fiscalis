import {
  WORLDBANK_INDICATORS,
  type IndicatorId,
  type IndicatorMetadata,
  type IndicatorCategory,
  type WorldBankDataPoint,
  type WorldBankApiResponse,
  type CountryDataPoint,
  type IndicatorData,
} from "@/lib/types/worldbank";

// ═══════════════════════════════════════════════════════════════
// World Bank API Configuration
// ═══════════════════════════════════════════════════════════════

const WORLDBANK_BASE_URL = "https://api.worldbank.org/v2";

// ═══════════════════════════════════════════════════════════════
// Formatting Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Format large numbers with appropriate suffix (K, M, B, T)
 */
function formatLargeNumber(value: number, prefix: string = ""): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? "-" : "";

  if (absValue >= 1e12)
    return `${sign}${prefix}${(absValue / 1e12).toFixed(2)}T`;
  if (absValue >= 1e9) return `${sign}${prefix}${(absValue / 1e9).toFixed(2)}B`;
  if (absValue >= 1e6) return `${sign}${prefix}${(absValue / 1e6).toFixed(2)}M`;
  if (absValue >= 1e3) return `${sign}${prefix}${(absValue / 1e3).toFixed(2)}K`;
  return `${sign}${prefix}${absValue.toFixed(0)}`;
}

/**
 * Format currency values
 */
function formatCurrency(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Format percentage values
 */
function formatPercent(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}

/**
 * Format population/count values
 */
function formatCount(value: number): string {
  return formatLargeNumber(value);
}

/**
 * Format years (for life expectancy)
 */
function formatYears(value: number): string {
  return `${value.toFixed(1)} years`;
}

/**
 * Format metric tons
 */
function formatMetricTons(value: number): string {
  return `${value.toFixed(2)} t`;
}

// ═══════════════════════════════════════════════════════════════
// Indicator Metadata Registry
// ═══════════════════════════════════════════════════════════════

type FormatFunction = (value: number) => string;

interface IndicatorConfig extends IndicatorMetadata {
  formatFn: FormatFunction;
}

export const INDICATOR_METADATA: Record<IndicatorId, IndicatorConfig> = {
  // Economy
  gdp: {
    id: "gdp",
    name: "GDP (Current US$)",
    description: "Gross Domestic Product at current prices",
    unit: "$",
    category: "economy",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  gdpPerCapita: {
    id: "gdpPerCapita",
    name: "GDP per Capita",
    description: "GDP divided by midyear population",
    unit: "$",
    category: "economy",
    formatFn: formatCurrency,
  },
  gdpGrowth: {
    id: "gdpGrowth",
    name: "GDP Growth Rate",
    description: "Annual percentage growth rate of GDP",
    unit: "%",
    category: "economy",
    formatFn: formatPercent,
  },
  gni: {
    id: "gni",
    name: "GNI (Current US$)",
    description: "Gross National Income at current prices",
    unit: "$",
    category: "economy",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },

  // Demographics
  population: {
    id: "population",
    name: "Population",
    description: "Total population count",
    unit: "",
    category: "demographics",
    formatFn: formatCount,
  },
  populationGrowth: {
    id: "populationGrowth",
    name: "Population Growth",
    description: "Annual population growth rate",
    unit: "%",
    category: "demographics",
    formatFn: formatPercent,
  },
  urbanPopulation: {
    id: "urbanPopulation",
    name: "Urban Population",
    description: "Percentage of population living in urban areas",
    unit: "%",
    category: "demographics",
    formatFn: formatPercent,
  },
  lifeExpectancy: {
    id: "lifeExpectancy",
    name: "Life Expectancy",
    description: "Life expectancy at birth, total years",
    unit: "years",
    category: "demographics",
    formatFn: formatYears,
  },

  // Finance
  inflation: {
    id: "inflation",
    name: "Inflation Rate",
    description: "Annual consumer price inflation",
    unit: "%",
    category: "finance",
    formatFn: formatPercent,
  },
  interestRate: {
    id: "interestRate",
    name: "Real Interest Rate",
    description: "Real interest rate adjusted for inflation",
    unit: "%",
    category: "finance",
    formatFn: formatPercent,
  },
  debtToGdp: {
    id: "debtToGdp",
    name: "Central Govt Debt (% of GDP)",
    description: "Central government debt as percentage of GDP",
    unit: "%",
    category: "finance",
    formatFn: formatPercent,
  },

  // Trade
  exports: {
    id: "exports",
    name: "Exports (Current US$)",
    description: "Exports of goods and services",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  imports: {
    id: "imports",
    name: "Imports (Current US$)",
    description: "Imports of goods and services",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  tradeBalance: {
    id: "tradeBalance",
    name: "Trade Balance",
    description: "External balance on goods and services",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },
  fdi: {
    id: "fdi",
    name: "Foreign Direct Investment",
    description: "Net inflows of foreign direct investment",
    unit: "$",
    category: "trade",
    formatFn: (v) => formatLargeNumber(v, "$"),
  },

  // Energy & Environment
  co2PerCapita: {
    id: "co2PerCapita",
    name: "CO₂ Emissions per Capita",
    description: "Carbon dioxide emissions per capita in metric tons",
    unit: "t",
    category: "energy",
    formatFn: formatMetricTons,
  },
  renewableEnergy: {
    id: "renewableEnergy",
    name: "Renewable Energy Consumption",
    description: "Percentage of total final energy consumption",
    unit: "%",
    category: "energy",
    formatFn: formatPercent,
  },
  electricityAccess: {
    id: "electricityAccess",
    name: "Access to Electricity",
    description: "Percentage of population with access to electricity",
    unit: "%",
    category: "energy",
    formatFn: formatPercent,
  },

  // Development
  povertyRate: {
    id: "povertyRate",
    name: "Poverty Rate",
    description: "Population living below $2.15/day (2017 PPP)",
    unit: "%",
    category: "development",
    formatFn: formatPercent,
  },
  unemployment: {
    id: "unemployment",
    name: "Unemployment Rate",
    description: "Unemployment as percentage of total labor force",
    unit: "%",
    category: "development",
    formatFn: formatPercent,
  },
  literacy: {
    id: "literacy",
    name: "Literacy Rate",
    description: "Adult literacy rate (ages 15+)",
    unit: "%",
    category: "development",
    formatFn: formatPercent,
  },

  // Commodities (Minerals, Oil, Gas)
  mineralRents: {
    id: "mineralRents",
    name: "Mineral Rents (% of GDP)",
    description:
      "Mineral rents including tin, gold, lead, zinc, iron, copper, nickel, silver, bauxite, and phosphate",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  oresMetalsExports: {
    id: "oresMetalsExports",
    name: "Ores & Metals Exports",
    description: "Ores and metals as percentage of merchandise exports",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  oresMetalsImports: {
    id: "oresMetalsImports",
    name: "Ores & Metals Imports",
    description: "Ores and metals as percentage of merchandise imports",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  mineralDepletion: {
    id: "mineralDepletion",
    name: "Mineral Depletion (% of GNI)",
    description:
      "Ratio of mineral stock value to remaining reserve lifetime (tin, gold, lead, zinc, iron, copper, nickel, silver, bauxite, phosphate)",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  oilRents: {
    id: "oilRents",
    name: "Oil Rents (% of GDP)",
    description:
      "Difference between crude oil production value at regional prices and total production costs",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  naturalGasRents: {
    id: "naturalGasRents",
    name: "Natural Gas Rents (% of GDP)",
    description:
      "Difference between natural gas production value at regional prices and total production costs",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
  totalResourceRents: {
    id: "totalResourceRents",
    name: "Total Natural Resources Rents (% of GDP)",
    description: "Sum of oil, natural gas, coal, mineral, and forest rents",
    unit: "%",
    category: "commodities",
    formatFn: formatPercent,
  },
};

// ═══════════════════════════════════════════════════════════════
// ISO Country Code Mapping (ISO3 → ISO2)
// World Bank uses ISO3, GeoJSON uses ISO2
// ═══════════════════════════════════════════════════════════════

export const ISO3_TO_ISO2: Record<string, string> = {
  AFG: "AF", // Afghanistan
  ALB: "AL", // Albania
  DZA: "DZ", // Algeria
  ASM: "AS", // American Samoa
  AND: "AD", // Andorra
  AGO: "AO", // Angola
  ATG: "AG", // Antigua and Barbuda
  ARG: "AR", // Argentina
  ARM: "AM", // Armenia
  ABW: "AW", // Aruba
  AUS: "AU", // Australia
  AUT: "AT", // Austria
  AZE: "AZ", // Azerbaijan
  BHS: "BS", // Bahamas
  BHR: "BH", // Bahrain
  BGD: "BD", // Bangladesh
  BRB: "BB", // Barbados
  BLR: "BY", // Belarus
  BEL: "BE", // Belgium
  BLZ: "BZ", // Belize
  BEN: "BJ", // Benin
  BMU: "BM", // Bermuda
  BTN: "BT", // Bhutan
  BOL: "BO", // Bolivia
  BIH: "BA", // Bosnia and Herzegovina
  BWA: "BW", // Botswana
  BRA: "BR", // Brazil
  BRN: "BN", // Brunei
  BGR: "BG", // Bulgaria
  BFA: "BF", // Burkina Faso
  BDI: "BI", // Burundi
  CPV: "CV", // Cabo Verde
  KHM: "KH", // Cambodia
  CMR: "CM", // Cameroon
  CAN: "CA", // Canada
  CYM: "KY", // Cayman Islands
  CAF: "CF", // Central African Republic
  TCD: "TD", // Chad
  CHL: "CL", // Chile
  CHN: "CN", // China
  COL: "CO", // Colombia
  COM: "KM", // Comoros
  COG: "CG", // Congo
  COD: "CD", // Democratic Republic of Congo
  CRI: "CR", // Costa Rica
  CIV: "CI", // Côte d'Ivoire
  HRV: "HR", // Croatia
  CUB: "CU", // Cuba
  CUW: "CW", // Curaçao
  CYP: "CY", // Cyprus
  CZE: "CZ", // Czech Republic
  DNK: "DK", // Denmark
  DJI: "DJ", // Djibouti
  DMA: "DM", // Dominica
  DOM: "DO", // Dominican Republic
  ECU: "EC", // Ecuador
  EGY: "EG", // Egypt
  SLV: "SV", // El Salvador
  GNQ: "GQ", // Equatorial Guinea
  ERI: "ER", // Eritrea
  EST: "EE", // Estonia
  SWZ: "SZ", // Eswatini
  ETH: "ET", // Ethiopia
  FRO: "FO", // Faroe Islands
  FJI: "FJ", // Fiji
  FIN: "FI", // Finland
  FRA: "FR", // France
  PYF: "PF", // French Polynesia
  GAB: "GA", // Gabon
  GMB: "GM", // Gambia
  GEO: "GE", // Georgia
  DEU: "DE", // Germany
  GHA: "GH", // Ghana
  GIB: "GI", // Gibraltar
  GRC: "GR", // Greece
  GRL: "GL", // Greenland
  GRD: "GD", // Grenada
  GUM: "GU", // Guam
  GTM: "GT", // Guatemala
  GIN: "GN", // Guinea
  GNB: "GW", // Guinea-Bissau
  GUY: "GY", // Guyana
  HTI: "HT", // Haiti
  HND: "HN", // Honduras
  HKG: "HK", // Hong Kong
  HUN: "HU", // Hungary
  ISL: "IS", // Iceland
  IND: "IN", // India
  IDN: "ID", // Indonesia
  IRN: "IR", // Iran
  IRQ: "IQ", // Iraq
  IRL: "IE", // Ireland
  IMN: "IM", // Isle of Man
  ISR: "IL", // Israel
  ITA: "IT", // Italy
  JAM: "JM", // Jamaica
  JPN: "JP", // Japan
  JOR: "JO", // Jordan
  KAZ: "KZ", // Kazakhstan
  KEN: "KE", // Kenya
  KIR: "KI", // Kiribati
  PRK: "KP", // North Korea
  KOR: "KR", // South Korea
  XKX: "XK", // Kosovo
  KWT: "KW", // Kuwait
  KGZ: "KG", // Kyrgyzstan
  LAO: "LA", // Laos
  LVA: "LV", // Latvia
  LBN: "LB", // Lebanon
  LSO: "LS", // Lesotho
  LBR: "LR", // Liberia
  LBY: "LY", // Libya
  LIE: "LI", // Liechtenstein
  LTU: "LT", // Lithuania
  LUX: "LU", // Luxembourg
  MAC: "MO", // Macao
  MDG: "MG", // Madagascar
  MWI: "MW", // Malawi
  MYS: "MY", // Malaysia
  MDV: "MV", // Maldives
  MLI: "ML", // Mali
  MLT: "MT", // Malta
  MHL: "MH", // Marshall Islands
  MRT: "MR", // Mauritania
  MUS: "MU", // Mauritius
  MEX: "MX", // Mexico
  FSM: "FM", // Micronesia
  MDA: "MD", // Moldova
  MCO: "MC", // Monaco
  MNG: "MN", // Mongolia
  MNE: "ME", // Montenegro
  MAR: "MA", // Morocco
  MOZ: "MZ", // Mozambique
  MMR: "MM", // Myanmar
  NAM: "NA", // Namibia
  NRU: "NR", // Nauru
  NPL: "NP", // Nepal
  NLD: "NL", // Netherlands
  NCL: "NC", // New Caledonia
  NZL: "NZ", // New Zealand
  NIC: "NI", // Nicaragua
  NER: "NE", // Niger
  NGA: "NG", // Nigeria
  MKD: "MK", // North Macedonia
  MNP: "MP", // Northern Mariana Islands
  NOR: "NO", // Norway
  OMN: "OM", // Oman
  PAK: "PK", // Pakistan
  PLW: "PW", // Palau
  PSE: "PS", // Palestine
  PAN: "PA", // Panama
  PNG: "PG", // Papua New Guinea
  PRY: "PY", // Paraguay
  PER: "PE", // Peru
  PHL: "PH", // Philippines
  POL: "PL", // Poland
  PRT: "PT", // Portugal
  PRI: "PR", // Puerto Rico
  QAT: "QA", // Qatar
  ROU: "RO", // Romania
  RUS: "RU", // Russia
  RWA: "RW", // Rwanda
  KNA: "KN", // Saint Kitts and Nevis
  LCA: "LC", // Saint Lucia
  MAF: "MF", // Saint Martin
  VCT: "VC", // Saint Vincent and the Grenadines
  WSM: "WS", // Samoa
  SMR: "SM", // San Marino
  STP: "ST", // São Tomé and Príncipe
  SAU: "SA", // Saudi Arabia
  SEN: "SN", // Senegal
  SRB: "RS", // Serbia
  SYC: "SC", // Seychelles
  SLE: "SL", // Sierra Leone
  SGP: "SG", // Singapore
  SXM: "SX", // Sint Maarten
  SVK: "SK", // Slovakia
  SVN: "SI", // Slovenia
  SLB: "SB", // Solomon Islands
  SOM: "SO", // Somalia
  ZAF: "ZA", // South Africa
  SSD: "SS", // South Sudan
  ESP: "ES", // Spain
  LKA: "LK", // Sri Lanka
  SDN: "SD", // Sudan
  SUR: "SR", // Suriname
  SWE: "SE", // Sweden
  CHE: "CH", // Switzerland
  SYR: "SY", // Syria
  TWN: "TW", // Taiwan
  TJK: "TJ", // Tajikistan
  TZA: "TZ", // Tanzania
  THA: "TH", // Thailand
  TLS: "TL", // Timor-Leste
  TGO: "TG", // Togo
  TON: "TO", // Tonga
  TTO: "TT", // Trinidad and Tobago
  TUN: "TN", // Tunisia
  TUR: "TR", // Turkey
  TKM: "TM", // Turkmenistan
  TCA: "TC", // Turks and Caicos Islands
  TUV: "TV", // Tuvalu
  UGA: "UG", // Uganda
  UKR: "UA", // Ukraine
  ARE: "AE", // United Arab Emirates
  GBR: "GB", // United Kingdom
  USA: "US", // United States
  URY: "UY", // Uruguay
  UZB: "UZ", // Uzbekistan
  VUT: "VU", // Vanuatu
  VEN: "VE", // Venezuela
  VNM: "VN", // Vietnam
  VGB: "VG", // British Virgin Islands
  VIR: "VI", // U.S. Virgin Islands
  YEM: "YE", // Yemen
  ZMB: "ZM", // Zambia
  ZWE: "ZW", // Zimbabwe
};

// ═══════════════════════════════════════════════════════════════
// Server-side API Functions (for Hono route)
// ═══════════════════════════════════════════════════════════════

const FETCH_TIMEOUT_MS = 15000; // 15 second timeout for World Bank API calls

/**
 * Fetch with timeout wrapper
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch indicator data from World Bank API (server-side)
 * @param indicator - The indicator key (e.g., "gdp", "population")
 * @param year - The year to fetch data for
 * @returns Array of country data points
 */
export async function fetchWorldBankIndicator(
  indicator: IndicatorId,
  year: number,
): Promise<CountryDataPoint[]> {
  const indicatorCode = WORLDBANK_INDICATORS[indicator];
  const url = `${WORLDBANK_BASE_URL}/country/all/indicator/${indicatorCode}?format=json&date=${year}&per_page=300`;

  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(
      `World Bank API error: ${response.status} ${response.statusText}`,
    );
  }

  const data: WorldBankApiResponse = await response.json();

  // World Bank returns [metadata, data[]] or [metadata, null] if no data
  if (!data[1] || !Array.isArray(data[1])) {
    return [];
  }

  const config = INDICATOR_METADATA[indicator];

  return data[1]
    .filter((d: WorldBankDataPoint) => d.value !== null && d.countryiso3code)
    .map((d: WorldBankDataPoint) => ({
      code: ISO3_TO_ISO2[d.countryiso3code] || d.countryiso3code,
      code3: d.countryiso3code,
      name: d.country.value,
      value: d.value,
      formattedValue: d.value !== null ? config.formatFn(d.value) : "N/A",
    }));
}

/**
 * Get indicator metadata (without formatFn for serialization)
 */
export function getIndicatorMetadata(
  indicator: IndicatorId,
): IndicatorMetadata {
  const { formatFn, ...metadata } = INDICATOR_METADATA[indicator];
  return metadata;
}

/**
 * Get all indicators metadata for UI dropdown
 */
export function getAllIndicatorsMetadata(): IndicatorMetadata[] {
  return Object.entries(INDICATOR_METADATA).map(([, config]) => {
    const { formatFn, ...metadata } = config;
    return metadata;
  });
}

/**
 * Get indicators grouped by category
 */
export function getIndicatorsByCategory(): Record<
  IndicatorCategory,
  IndicatorMetadata[]
> {
  const grouped: Record<IndicatorCategory, IndicatorMetadata[]> = {
    economy: [],
    demographics: [],
    finance: [],
    trade: [],
    energy: [],
    development: [],
    commodities: [],
  };

  for (const [, config] of Object.entries(INDICATOR_METADATA)) {
    const { formatFn, ...metadata } = config;
    grouped[metadata.category].push(metadata);
  }

  return grouped;
}

// ═══════════════════════════════════════════════════════════════
// Client-side API Functions (for React hooks)
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch world data from our API route (client-side)
 * @param indicator - The indicator key
 * @param year - The year to fetch data for
 * @returns Indicator data with all countries
 */
export async function getWorldData(
  indicator: IndicatorId,
  year: number,
): Promise<IndicatorData> {
  const response = await fetch(`/api/world-data/${indicator}?year=${year}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to fetch world data: ${response.status}`,
    );
  }

  return response.json();
}

/**
 * Fetch list of available indicators (client-side)
 */
export async function getIndicators(): Promise<{
  indicators: IndicatorMetadata[];
}> {
  const response = await fetch("/api/world-data/indicators");

  if (!response.ok) {
    throw new Error(`Failed to fetch indicators: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch indicators grouped by category (client-side)
 */
export async function getIndicatorsGrouped(): Promise<{
  grouped: Record<IndicatorCategory, IndicatorMetadata[]>;
}> {
  const response = await fetch("/api/world-data/indicators?grouped=true");

  if (!response.ok) {
    throw new Error(`Failed to fetch indicators: ${response.status}`);
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════
// Dynamic Indicator Functions (Client-side)
// ═══════════════════════════════════════════════════════════════

import type {
  SearchedIndicator,
  DynamicIndicatorData,
} from "@/lib/types/worldbank-search";

/**
 * Search World Bank indicators by keyword
 */
export async function searchWorldBankIndicators(
  query: string,
  limit: number = 50,
): Promise<{ indicators: SearchedIndicator[]; query: string }> {
  if (!query || query.length < 2) {
    return { indicators: [], query };
  }

  const response = await fetch(
    `/api/world-data/search?q=${encodeURIComponent(query)}&limit=${limit}`,
  );

  if (!response.ok) {
    throw new Error(`Failed to search indicators: ${response.status}`);
  }

  return response.json();
}

/**
 * Fetch data for any World Bank indicator by code
 */
export async function getDynamicWorldData(
  indicatorCode: string,
  year: number,
): Promise<DynamicIndicatorData> {
  const response = await fetch(
    `/api/world-data/dynamic/${encodeURIComponent(indicatorCode)}?year=${year}`,
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error || `Failed to fetch indicator data: ${response.status}`,
    );
  }

  return response.json();
}

/**
 * Get metadata for any World Bank indicator
 */
export async function getIndicatorInfo(
  indicatorCode: string,
): Promise<{ indicator: SearchedIndicator } | null> {
  const response = await fetch(
    `/api/world-data/info/${encodeURIComponent(indicatorCode)}`,
  );

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`Failed to fetch indicator info: ${response.status}`);
  }

  return response.json();
}
