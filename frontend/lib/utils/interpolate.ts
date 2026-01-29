import { MetalChartData } from "@/lib/types/metals";

/**
 * Interpolates missing or zero values in chart data.
 * Missing data is filled using linear interpolation from surrounding valid points.
 * Interpolated points are marked with isInterpolated: true for visual distinction.
 *
 * @param data - Array of chart data points (may contain null/0 prices)
 * @returns New array with interpolated values marked
 */
export function interpolateMissingData(
  data: MetalChartData[],
): MetalChartData[] {
  if (!data || data.length === 0) return [];

  // Create a copy to avoid mutating original data
  const result: MetalChartData[] = data.map((d) => ({ ...d }));

  // Find indices of invalid (missing/zero) data points
  const invalidIndices: number[] = [];
  for (let i = 0; i < result.length; i++) {
    const price = result[i].price;
    if (price === null || price === undefined || price === 0) {
      invalidIndices.push(i);
    }
  }

  if (invalidIndices.length === 0) return result;

  // For each invalid point, interpolate using nearest valid neighbors
  for (const idx of invalidIndices) {
    // Find previous valid point
    let prevIdx = idx - 1;
    while (prevIdx >= 0) {
      const price = result[prevIdx].price;
      if (
        price !== null &&
        price !== undefined &&
        price > 0 &&
        !result[prevIdx].isInterpolated
      ) {
        break;
      }
      prevIdx--;
    }

    // Find next valid point
    let nextIdx = idx + 1;
    while (nextIdx < result.length) {
      const price = result[nextIdx].price;
      if (
        price !== null &&
        price !== undefined &&
        price > 0 &&
        !result[nextIdx].isInterpolated
      ) {
        break;
      }
      nextIdx++;
    }

    // Calculate interpolated value
    let interpolatedPrice: number;

    if (prevIdx >= 0 && nextIdx < result.length) {
      // Both neighbors exist - linear interpolation
      const prevPrice = result[prevIdx].price!;
      const nextPrice = result[nextIdx].price!;
      const ratio = (idx - prevIdx) / (nextIdx - prevIdx);
      interpolatedPrice = prevPrice + (nextPrice - prevPrice) * ratio;
    } else if (prevIdx >= 0) {
      // Only previous neighbor exists - use that value
      interpolatedPrice = result[prevIdx].price!;
    } else if (nextIdx < result.length) {
      // Only next neighbor exists - use that value
      interpolatedPrice = result[nextIdx].price!;
    } else {
      // No valid neighbors at all - keep as null
      continue;
    }

    result[idx] = {
      ...result[idx],
      price: interpolatedPrice,
      isInterpolated: true,
    };
  }

  return result;
}

/**
 * Checks if any data points in the array are interpolated
 */
export function hasInterpolatedData(data: MetalChartData[]): boolean {
  return data.some((d) => d.isInterpolated);
}

/**
 * Gets the count of interpolated data points
 */
export function getInterpolatedCount(data: MetalChartData[]): number {
  return data.filter((d) => d.isInterpolated).length;
}
