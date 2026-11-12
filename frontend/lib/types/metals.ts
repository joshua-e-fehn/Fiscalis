export type MetalCurrency = "eur" | "usd" | "chf";

export type MetalType = "gold" | "silver" | "platinum" | "palladium";

export interface MetalChartData {
  date: Date | null;
  /** null (or 0) where no price was recorded: a gap, never filled */
  price: number | null;
}
