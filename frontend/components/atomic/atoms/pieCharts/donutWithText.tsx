"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import { Label, Pie, PieChart } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/shadcn/chart";

interface PieChartDonutWithTextProps {
  chartData: any[] | undefined;
  chartConfig: ChartConfig;
  dataKey: string;
  nameKey: string;
  title: string;
  description: string;
  subTitle?: string;
  subDescription?: string;
  isFinancial?: boolean;
  currencyChar?: string;
  size?: "sm" | "md" | "lg" | "xl";
  customSize?: {
    width: number;
    height: number;
    innerRadius: number;
    fontSizeTitle: string;
    fontSizeDescription: string;
    fontSizeSubTitle: string;
    fontSizeSubDescription: string;
    fontSizeTotalTitle: string;
    fontSizeTotalDescription: string;
    totalQuantityPadding: number;
    cardWidth: string;
    strokeWidth: number;
  };
}

const CHART_SIZES = {
  sm: {
    width: 300,
    height: 400,
    innerRadius: 60,
    fontSizeTitle: "text-2xl",
    fontSizeDescription: "text-base",
    fontSizeSubTitle: "text-base",
    fontSizeSubDescription: "text-sm",
    fontSizeTotalTitle: "text-xl",
    fontSizeTotalDescription: "text-lg",
    totalQuantityPadding: 24,
    strokeWidth: 5,
  },
  md: {
    width: 400,
    height: 500,
    innerRadius: 90,
    fontSizeTitle: "text-4xl",
    fontSizeDescription: "text-lg",
    fontSizeSubTitle: "text-lg",
    fontSizeSubDescription: "text-base",
    fontSizeTotalTitle: "text-3xl",
    fontSizeTotalDescription: "text-xl",
    totalQuantityPadding: 30,
    strokeWidth: 5,
  },
  lg: {
    width: 500,
    height: 600,
    innerRadius: 120,
    fontSizeTitle: "text-5xl",
    fontSizeDescription: "text-xl",
    fontSizeSubTitle: "text-xl",
    fontSizeSubDescription: "text-lg",
    fontSizeTotalTitle: "text-4xl",
    fontSizeTotalDescription: "text-2xl",
    totalQuantityPadding: 36,
    strokeWidth: 10,
  },
  xl: {
    width: 600,
    height: 700,
    innerRadius: 150,
    fontSizeTitle: "text-6xl",
    fontSizeDescription: "text-2xl",
    fontSizeSubTitle: "text-2xl",
    fontSizeSubDescription: "text-xl",
    fontSizeTotalTitle: "text-5xl",
    fontSizeTotalDescription: "text-3xl",
    totalQuantityPadding: 45,
    strokeWidth: 10,
  },
} as const;

export function PieChartDonutWithText({
  chartData,
  chartConfig,
  dataKey,
  nameKey,
  title,
  description,
  subTitle,
  subDescription,
  isFinancial = false,
  currencyChar = "€",
  size = "md",
  customSize,
}: PieChartDonutWithTextProps) {
  const totalQuantity = React.useMemo(() => {
    return chartData?.reduce((acc, curr) => acc + (curr[dataKey] || 0), 0) || 0;
  }, [chartData, dataKey]);

  const capitalizeString = (str: string) =>
    str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();

  const chartSize = customSize ?? CHART_SIZES[size];

  return (
    <Card
      className={`flex flex-col min-w-[${chartSize.width}px] max-w-[${chartSize.width}px]]`}
    >
      <CardHeader className="items-center pb-0">
        <CardTitle className={`${chartSize.fontSizeTitle}`}>{title}</CardTitle>
        <CardDescription className={`${chartSize.fontSizeDescription}`}>
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square w-full"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Pie
              data={chartData}
              dataKey={dataKey}
              nameKey={nameKey}
              innerRadius={chartSize.innerRadius}
              strokeWidth={chartSize.strokeWidth}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className={`fill-foreground ${chartSize.fontSizeTotalTitle} font-bold`}
                        >
                          {(isFinancial ? currencyChar : "") +
                            totalQuantity.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + chartSize.totalQuantityPadding}
                          className={`fill-muted-foreground ${chartSize.fontSizeTotalDescription}`}
                        >
                          {capitalizeString(dataKey)}
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col gap-2">
        <div
          className={`flex items-center gap-2 font-medium leading-none ${chartSize.fontSizeSubTitle}`}
        >
          <TrendingUp className="h-4 w-4" /> {subTitle}
        </div>
        <div
          className={`leading-none text-muted-foreground ${chartSize.fontSizeSubDescription}`}
        >
          {subDescription}
        </div>
      </CardFooter>
    </Card>
  );
}
