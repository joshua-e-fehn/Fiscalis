// ═══════════════════════════════════════════════════════════════
// Map Color Scale Utilities
// ═══════════════════════════════════════════════════════════════

export type ColorScaleType =
  | "sequential"
  | "diverging"
  | "quantile"
  | "logarithmic";

// Color palettes
const BLUE_PALETTE = [
  "#eff6ff", // blue-50
  "#dbeafe", // blue-100
  "#bfdbfe", // blue-200
  "#93c5fd", // blue-300
  "#60a5fa", // blue-400
  "#3b82f6", // blue-500
  "#2563eb", // blue-600
  "#1d4ed8", // blue-700
  "#1e40af", // blue-800
] as const;

const GREEN_PALETTE = [
  "#f0fdf4", // green-50
  "#dcfce7", // green-100
  "#bbf7d0", // green-200
  "#86efac", // green-300
  "#4ade80", // green-400
  "#22c55e", // green-500
  "#16a34a", // green-600
  "#15803d", // green-700
  "#166534", // green-800
] as const;

// Diverging palette: higher is GOOD (red = low/negative, green = high/positive)
const RED_TO_GREEN_PALETTE = [
  "#ef4444", // red-500
  "#f97316", // orange-500
  "#facc15", // yellow-400
  "#84cc16", // lime-500
  "#22c55e", // green-500
] as const;

// Inverted diverging palette: higher is BAD (green = low, red = high)
// Used for indicators like inflation, unemployment, poverty where lower is better
const GREEN_TO_RED_PALETTE = [
  "#22c55e", // green-500
  "#84cc16", // lime-500
  "#facc15", // yellow-400
  "#f97316", // orange-500
  "#ef4444", // red-500
] as const;

// No data color - distinct gray to differentiate from low values
export const NO_DATA_COLOR = "#d1d5db"; // gray-300 (more visible than gray-100)

// Indicators where HIGHER values are BAD (should use inverted diverging colors)
// These will show green for low values and red for high values
const INVERTED_INDICATORS = [
  "inflation", // High inflation is bad
  "unemployment", // High unemployment is bad
  "povertyRate", // High poverty is bad
  "debtToGdp", // High debt is generally bad
  "co2PerCapita", // High CO2 is environmentally bad
] as const;

// Indicators that should use logarithmic scale (large value ranges)
const LOGARITHMIC_INDICATORS = [
  "gdp", // Ranges from millions to trillions
  "population", // Ranges from thousands to billions
  "gdpPerCapita", // Wide range
  "gni", // Similar to GDP
  "exports", // Wide range
  "imports", // Wide range
  "fdi", // Wide range
] as const;

/**
 * Check if an indicator should use inverted colors (high = bad)
 */
export function isInvertedIndicator(indicatorId: string): boolean {
  return INVERTED_INDICATORS.includes(indicatorId as any);
}

/**
 * Check if an indicator should use logarithmic scale
 */
export function isLogarithmicIndicator(indicatorId: string): boolean {
  return LOGARITHMIC_INDICATORS.includes(indicatorId as any);
}

/**
 * Create a color scale function based on the provided values
 */
export function createColorScale(
  values: number[],
  type: ColorScaleType = "quantile",
  palette: readonly string[] = BLUE_PALETTE,
  inverted: boolean = false,
): (value: number | null) => string {
  const validValues = values.filter((v): v is number => v != null && !isNaN(v));

  if (validValues.length === 0) {
    return () => NO_DATA_COLOR;
  }

  const sortedValues = [...validValues].sort((a, b) => a - b);
  const minValue = sortedValues[0];
  const maxValue = sortedValues[sortedValues.length - 1];

  switch (type) {
    case "sequential":
      return createSequentialScale(minValue, maxValue, palette);

    case "diverging":
      // Use inverted palette if indicator is "higher is bad" (like inflation)
      const divergingPalette = inverted
        ? GREEN_TO_RED_PALETTE
        : RED_TO_GREEN_PALETTE;
      return createDivergingScale(sortedValues, divergingPalette);

    case "logarithmic":
      return createLogarithmicScale(sortedValues, palette);

    case "quantile":
    default:
      return createQuantileScale(sortedValues, palette);
  }
}

/**
 * Sequential scale - linear interpolation from min to max
 */
function createSequentialScale(
  minValue: number,
  maxValue: number,
  palette: readonly string[],
): (value: number | null) => string {
  const range = maxValue - minValue;

  return (value: number | null): string => {
    if (value == null || isNaN(value)) return NO_DATA_COLOR;
    if (range === 0) return palette[Math.floor(palette.length / 2)];

    const normalized = (value - minValue) / range;
    const index = Math.min(
      Math.floor(normalized * palette.length),
      palette.length - 1,
    );
    return palette[index];
  };
}

/**
 * Logarithmic scale - better visualization for data spanning many orders of magnitude
 * Uses log10 transformation to compress the range
 */
function createLogarithmicScale(
  sortedValues: number[],
  palette: readonly string[],
): (value: number | null) => string {
  // Filter positive values for log transformation
  const positiveValues = sortedValues.filter((v) => v > 0);

  if (positiveValues.length === 0) {
    return createQuantileScale(sortedValues, palette);
  }

  const logMin = Math.log10(positiveValues[0]);
  const logMax = Math.log10(positiveValues[positiveValues.length - 1]);
  const logRange = logMax - logMin;

  const numBuckets = Math.min(palette.length, 5);
  const selectedColors: string[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const paletteIndex = Math.floor(
      (i / (numBuckets - 1)) * (palette.length - 1),
    );
    selectedColors.push(palette[paletteIndex]);
  }

  return (value: number | null): string => {
    if (value == null || isNaN(value)) return NO_DATA_COLOR;
    if (value <= 0) return NO_DATA_COLOR; // Log scale doesn't work for non-positive values

    if (logRange === 0) return selectedColors[Math.floor(numBuckets / 2)];

    const logValue = Math.log10(value);
    const normalized = (logValue - logMin) / logRange;
    const index = Math.min(
      Math.max(0, Math.floor(normalized * numBuckets)),
      numBuckets - 1,
    );
    return selectedColors[index];
  };
}

/**
 * Quantile scale - equal number of values in each bucket
 */
function createQuantileScale(
  sortedValues: number[],
  palette: readonly string[],
): (value: number | null) => string {
  const numBuckets = Math.min(palette.length, 5); // Use 5 quantiles by default
  const quantiles: number[] = [];

  for (let i = 1; i < numBuckets; i++) {
    const index = Math.floor((i / numBuckets) * sortedValues.length);
    quantiles.push(sortedValues[index]);
  }

  // Select colors evenly from palette
  const selectedColors: string[] = [];
  for (let i = 0; i < numBuckets; i++) {
    const paletteIndex = Math.floor(
      (i / (numBuckets - 1)) * (palette.length - 1),
    );
    selectedColors.push(palette[paletteIndex]);
  }

  return (value: number | null): string => {
    if (value == null || isNaN(value)) return NO_DATA_COLOR;

    for (let i = 0; i < quantiles.length; i++) {
      if (value < quantiles[i]) {
        return selectedColors[i];
      }
    }
    return selectedColors[selectedColors.length - 1];
  };
}

/**
 * Diverging scale - for values that can be positive or negative (e.g., growth rates)
 * Color semantics depend on palette passed in (red-to-green or green-to-red)
 */
function createDivergingScale(
  sortedValues: number[],
  palette: readonly string[],
): (value: number | null) => string {
  const minValue = sortedValues[0];
  const maxValue = sortedValues[sortedValues.length - 1];
  const midIndex = Math.floor(palette.length / 2);

  // Handle case where all values are same sign
  const hasNegative = minValue < 0;
  const hasPositive = maxValue > 0;

  return (value: number | null): string => {
    if (value == null || isNaN(value)) return NO_DATA_COLOR;

    if (!hasNegative && !hasPositive) {
      return palette[midIndex]; // All zeros
    }

    if (value === 0) {
      return palette[midIndex];
    }

    if (value < 0) {
      if (!hasNegative || minValue === 0) return palette[midIndex];
      const normalized = value / minValue; // 0 to 1 (higher = more negative)
      const index = Math.min(Math.floor(normalized * midIndex), midIndex - 1);
      return palette[midIndex - 1 - index];
    }

    // value > 0
    if (!hasPositive || maxValue === 0) return palette[midIndex];
    const normalized = value / maxValue; // 0 to 1
    const index = Math.min(
      Math.floor(normalized * (palette.length - midIndex - 1)),
      palette.length - midIndex - 2,
    );
    return palette[midIndex + 1 + index];
  };
}

/**
 * Get the color for countries with no data
 */
export function getNoDataColor(): string {
  return NO_DATA_COLOR;
}

/**
 * Get color palette for legend display
 */
export function getColorPalette(
  type: ColorScaleType = "quantile",
  numColors: number = 5,
  inverted: boolean = false,
): string[] {
  let palette: readonly string[];

  if (type === "diverging") {
    palette = inverted ? GREEN_TO_RED_PALETTE : RED_TO_GREEN_PALETTE;
  } else {
    palette = BLUE_PALETTE;
  }

  const result: string[] = [];
  for (let i = 0; i < numColors; i++) {
    const index = Math.floor((i / (numColors - 1)) * (palette.length - 1));
    result.push(palette[index]);
  }

  return result;
}

/**
 * Determine best color scale type based on indicator
 */
export function getRecommendedColorScale(indicatorId: string): ColorScaleType {
  // Magnitude indicators that span many orders of magnitude should use logarithmic scale
  if (isLogarithmicIndicator(indicatorId)) {
    return "logarithmic";
  }

  // Growth rates and changes should use diverging scale
  const divergingIndicators = [
    "gdpGrowth",
    "populationGrowth",
    "inflation",
    "tradeBalance",
    "unemployment", // Include unemployment since it can be diverging too
    "povertyRate", // Poverty rates also benefit from diverging
  ];

  if (divergingIndicators.includes(indicatorId)) {
    return "diverging";
  }

  return "quantile";
}

/**
 * Create MapLibre expression for color interpolation
 * This can be used directly in the map layer paint property
 */
export function createMapColorExpression(
  values: number[],
  type: ColorScaleType = "quantile",
  inverted: boolean = false,
): any[] {
  const validValues = values.filter((v): v is number => v != null && !isNaN(v));

  if (validValues.length === 0) {
    return ["literal", NO_DATA_COLOR];
  }

  const sortedValues = [...validValues].sort((a, b) => a - b);

  // Select appropriate palette
  let palette: readonly string[];
  if (type === "diverging") {
    palette = inverted ? GREEN_TO_RED_PALETTE : RED_TO_GREEN_PALETTE;
  } else {
    palette = BLUE_PALETTE;
  }

  const numStops = 5;

  // Create stops for interpolation
  const stops: (number | string)[] = [];

  if (type === "logarithmic") {
    // For logarithmic scale, create stops based on log-spaced values
    const positiveValues = sortedValues.filter((v) => v > 0);
    if (positiveValues.length === 0) {
      // Fall back to quantile if no positive values
      return createMapColorExpression(values, "quantile", inverted);
    }

    const logMin = Math.log10(positiveValues[0]);
    const logMax = Math.log10(positiveValues[positiveValues.length - 1]);
    const logRange = logMax - logMin;

    for (let i = 0; i < numStops; i++) {
      const logValue = logMin + (i / (numStops - 1)) * logRange;
      const value = Math.pow(10, logValue);
      const paletteIndex = Math.floor(
        (i / (numStops - 1)) * (palette.length - 1),
      );

      stops.push(value);
      stops.push(palette[paletteIndex]);
    }
  } else {
    // For other scales, use quantile-based stops
    for (let i = 0; i < numStops; i++) {
      const valueIndex = Math.floor(
        (i / (numStops - 1)) * (sortedValues.length - 1),
      );
      const paletteIndex = Math.floor(
        (i / (numStops - 1)) * (palette.length - 1),
      );

      stops.push(sortedValues[valueIndex]);
      stops.push(palette[paletteIndex]);
    }
  }

  // MapLibre expression for coloring
  // We use a special marker value (-999999999) for "no data" since null doesn't serialize well in GeoJSON
  // The GeoJSON processing should set dataValue to this marker when there's no data
  return [
    "case",
    // Check if dataValue is the "no data" marker or missing
    [
      "any",
      ["!", ["has", "dataValue"]],
      ["==", ["get", "dataValue"], -999999999],
      ["==", ["get", "dataValue"], null],
      ["==", ["typeof", ["get", "dataValue"]], "string"],
    ],
    NO_DATA_COLOR,
    ["interpolate", ["linear"], ["get", "dataValue"], ...stops],
  ];
}
