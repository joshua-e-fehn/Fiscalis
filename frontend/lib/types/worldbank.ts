import type { IndicatorSeries } from "@/../services/worldbank/series";

// ═══════════════════════════════════════════════════════════════
// World Bank API Types & Indicator Definitions
// ═══════════════════════════════════════════════════════════════

// World Bank indicator codes
export const WORLDBANK_INDICATORS = {
  // Economy
  gdp: "NY.GDP.MKTP.CD",
  gdpPerCapita: "NY.GDP.PCAP.CD",
  gdpGrowth: "NY.GDP.MKTP.KD.ZG",
  gni: "NY.GNP.MKTP.CD",

  // Demographics
  population: "SP.POP.TOTL",
  populationGrowth: "SP.POP.GROW",
  urbanPopulation: "SP.URB.TOTL.IN.ZS",
  lifeExpectancy: "SP.DYN.LE00.IN",

  // Finance
  inflation: "FP.CPI.TOTL.ZG",
  interestRate: "FR.INR.RINR",
  debtToGdp: "GC.DOD.TOTL.GD.ZS",

  // Trade
  exports: "NE.EXP.GNFS.CD",
  imports: "NE.IMP.GNFS.CD",
  tradeBalance: "NE.RSB.GNFS.CD",
  fdi: "BX.KLT.DINV.CD.WD",

  // Energy & Environment
  co2PerCapita: "EN.GHG.CO2.PC.CE.AR5", // Updated: old indicator EN.ATM.CO2E.PC was archived
  renewableEnergy: "EG.FEC.RNEW.ZS",
  electricityAccess: "EG.ELC.ACCS.ZS",

  // Development
  povertyRate: "SI.POV.DDAY",
  unemployment: "SL.UEM.TOTL.ZS",
  literacy: "SE.ADT.LITR.ZS",

  // Commodities (Minerals, Oil, Gas)
  mineralRents: "NY.GDP.MINR.RT.ZS",
  oresMetalsExports: "TX.VAL.MMTL.ZS.UN",
  oresMetalsImports: "TM.VAL.MMTL.ZS.UN",
  mineralDepletion: "NY.ADJ.DMIN.GN.ZS",
  oilRents: "NY.GDP.PETR.RT.ZS",
  naturalGasRents: "NY.GDP.NGAS.RT.ZS",
  totalResourceRents: "NY.GDP.TOTL.RT.ZS",
} as const;

export type IndicatorId = keyof typeof WORLDBANK_INDICATORS;
export type IndicatorCode = (typeof WORLDBANK_INDICATORS)[IndicatorId];

// Indicator category types
export type IndicatorCategory =
  | "economy"
  | "demographics"
  | "finance"
  | "trade"
  | "energy"
  | "development"
  | "commodities";

// Indicator metadata for UI display
export interface IndicatorMetadata {
  id: IndicatorId;
  name: string;
  description: string;
  unit: string;
  category: IndicatorCategory;
}

// World Bank API response types (raw from API)
export interface WorldBankApiMetadata {
  page: number;
  pages: number;
  per_page: number;
  total: number;
  sourceid: string;
  lastupdated: string;
}

export interface WorldBankDataPoint {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
  unit: string;
  obs_status: string;
  decimal: number;
}

// Raw World Bank API response is a tuple: [metadata, data[]]
export type WorldBankApiResponse = [
  WorldBankApiMetadata,
  WorldBankDataPoint[] | null,
];

// Normalized output types (for frontend consumption)
export interface CountryDataPoint {
  code: string; // ISO 2-letter code (matches GeoJSON)
  code3: string; // ISO 3-letter code
  name: string;
  value: number | null;
  formattedValue: string;
}

/**
 * What the map shows about any indicator, featured (id = IndicatorId) or
 * found through the search (id = World Bank code).
 */
export interface SeriesIndicator {
  id: string;
  name: string;
  description: string;
  unit: string;
}

/** An indicator's full history as served by /api/world-data. */
export interface IndicatorSeriesData {
  indicator: SeriesIndicator;
  source: "World Bank";
  /** The World Bank's last update of the source (YYYY-MM-DD) */
  lastUpdated: string | null;
  series: IndicatorSeries;
}

/** One year of an indicator, derived on the client from its series. */
export interface IndicatorData {
  indicator: SeriesIndicator;
  year: number;
  lastUpdated: string | null;
  source: "World Bank";
  countries: CountryDataPoint[];
}

/**
 * Years the World Bank API is asked for. The map itself uses each
 * indicator's own first/last year with data.
 */
export const YEAR_RANGE = {
  min: 1960,
  max: new Date().getUTCFullYear() - 1,
} as const;

// List of all indicator IDs for validation
export const INDICATOR_IDS = Object.keys(WORLDBANK_INDICATORS) as IndicatorId[];

/** Whether an id names one of the curated (featured) indicators. */
export function isIndicatorId(id: string): id is IndicatorId {
  return Object.hasOwn(WORLDBANK_INDICATORS, id);
}
