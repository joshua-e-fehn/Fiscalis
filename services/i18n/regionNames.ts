/**
 * Country and territory names in the UI language, from Intl.DisplayNames
 * (type "region"). World Bank data names countries in English only; the UI
 * passes that English name as the fallback.
 *
 * Only ISO 3166-1 alpha-2 codes are looked up. World Bank aggregates use
 * codes Intl does not know ("1W", "XC", "ZG"), and the map's GeoJSON uses
 * "-99" for unassigned features: those keep the fallback name.
 *
 * English keeps the fallback too. The source names are already English and
 * read better than CLDR's long forms ("Congo - Kinshasa", "Myanmar (Burma)",
 * "Hong Kong SAR China", "Palestinian Territories").
 */

const ALPHA_2 = /^[A-Z]{2}$/;

export type RegionNamer = (code: string | undefined, fallback: string) => string;

/** A namer for one locale (an Intl tag such as "de-DE"). */
export function createRegionNamer(locale: string): RegionNamer {
  if (isEnglish(locale)) return (_code, fallback) => fallback;

  let displayNames: Intl.DisplayNames | undefined;
  try {
    displayNames = new Intl.DisplayNames([locale], {
      type: "region",
      fallback: "none",
    });
  } catch {
    displayNames = undefined;
  }

  return (code, fallback) => {
    if (!displayNames || !code) return fallback;
    const normalized = code.toUpperCase();
    if (!ALPHA_2.test(normalized)) return fallback;
    try {
      return displayNames.of(normalized) ?? fallback;
    } catch {
      return fallback;
    }
  };
}

function isEnglish(locale: string): boolean {
  return /^en(?:-|_|$)/i.test(locale.trim());
}
