"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import type { TooltipProps } from "recharts";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
} from "@/components/ui/shadcn/chart";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/shadcn/sheet";
import { useCountryData, useIndicatorFormat } from "@/hooks/worldbank";
import type { HistoryPoint } from "@/../services/worldbank/countryViews";

export interface CountryHistoryPanelProps {
  /** The clicked country (ISO alpha-2 code and display name), or null */
  country: { code: string; name: string } | null;
  onClose: () => void;
  /** Featured indicator id or World Bank code of a searched indicator */
  indicator: string;
  isDynamic: boolean;
  indicatorName: string;
  unit: string | undefined;
}

const chartConfig = {
  value: { color: "hsl(var(--chart-1))" },
} satisfies ChartConfig;

/**
 * Side panel with one country's history for the selected indicator: a line
 * chart over every year with data; years without data are gaps, not zeros.
 */
export function CountryHistoryPanel({
  country,
  onClose,
  indicator,
  isDynamic,
  indicatorName,
  unit,
}: CountryHistoryPanelProps) {
  const t = useTranslations("worldMap");
  const fmt = useIndicatorFormat(unit);
  const history = useCountryData(indicator, country?.code ?? null, isDynamic);

  const recorded = history.data.filter(
    (p): p is HistoryPoint & { value: number } => p.value !== null,
  );
  const first = recorded[0];
  const latest = recorded[recorded.length - 1];
  const hasGaps = recorded.length < history.data.length;
  const stillLoading = history.isLoading;

  return (
    <Sheet open={country !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{country?.name}</SheetTitle>
          <SheetDescription>
            {t("country.description", { indicator: indicatorName })}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-4">
          {stillLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("map.loading")}
            </div>
          )}

          {history.isError && (
            <p className="text-sm text-destructive">
              {t("errors.loadDescription")}
            </p>
          )}

          {recorded.length === 0 ? (
            !stillLoading &&
            !history.isError && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t("country.empty")}
              </p>
            )
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Stat
                  label={t("country.first", { year: first.year })}
                  value={fmt.value(first.value)}
                />
                <Stat
                  label={t("country.latest", { year: latest.year })}
                  value={fmt.value(latest.value)}
                />
                <Stat
                  label={t("country.change", { year: first.year })}
                  value={fmt.change(latest.value - first.value)}
                />
              </div>

              <ChartContainer config={chartConfig} className="h-[280px] w-full">
                <LineChart
                  accessibilityLayer
                  data={history.data}
                  margin={{ left: 8, right: 8, top: 8 }}
                >
                  <CartesianGrid
                    vertical={false}
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="year"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tick={{
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    domain={["auto", "auto"]}
                    axisLine={false}
                    tickLine={false}
                    width={72}
                    tick={{
                      fill: "hsl(var(--muted-foreground))",
                      fontSize: 11,
                    }}
                    tickFormatter={(v: number) => fmt.value(v)}
                  />
                  {/* A gap (value null) must reach the tooltip to say "no data" */}
                  <ChartTooltip
                    cursor={false}
                    filterNull={false}
                    content={
                      <HistoryTooltip
                        formatValue={fmt.value}
                        noData={t("map.noData")}
                      />
                    }
                  />
                  <Line
                    dataKey="value"
                    type="linear"
                    stroke="var(--color-value)"
                    strokeWidth={2}
                    dot={recorded.length === 1}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>

              {hasGaps && (
                <p className="text-xs text-muted-foreground">
                  {t("country.gaps")}
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function HistoryTooltip({
  active,
  payload,
  formatValue,
  noData,
}: TooltipProps<number, string> & {
  formatValue: (value: number) => string;
  noData: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as HistoryPoint;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <div className="font-medium">{point.year}</div>
      <div className="text-muted-foreground">
        {point.value === null ? noData : formatValue(point.value)}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-semibold">{value}</p>
    </div>
  );
}
