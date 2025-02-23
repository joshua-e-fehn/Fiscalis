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
  innerChartData: any[] | undefined;
  outerChartData: any[] | undefined;
  chartConfig: ChartConfig;
  innerDataKey: string;
  outerDataKey: string;
  nameKey: string;
  labelKey: string;
  title: string;
  description: string;
  subTitle?: string;
  subDescription?: string;
  size?: "sm" | "md" | "lg" | "xl";
  customSize?: {
    width: number;
    height: number;
    innerChartOuterRadius: number;
    outerChartInnerRadius: number;
    fontSizeTitle: string;
    fontSizeDescription: string;
    fontSizeSubTitle: string;
    fontSizeSubDescription: string;
    totalQuantityPadding: number;
    cardWidth: string;
    strokeWidth: number;
  };
}

const CHART_SIZES = {
  sm: {
    width: 300,
    height: 400,
    innerChartOuterRadius: 50,
    outerChartInnerRadius: 60,
    fontSizeTitle: "text-2xl",
    fontSizeDescription: "text-base",
    fontSizeSubTitle: "text-base",
    fontSizeSubDescription: "text-sm",
    totalQuantityPadding: 24,
    strokeWidth: 5,
  },
  md: {
    width: 400,
    height: 525,
    innerChartOuterRadius: 77,
    outerChartInnerRadius: 90,
    fontSizeTitle: "text-4xl",
    fontSizeDescription: "text-lg",
    fontSizeSubTitle: "text-lg",
    fontSizeSubDescription: "text-base",
    totalQuantityPadding: 30,
    strokeWidth: 5,
  },
  lg: {
    width: 500,
    height: 650,
    innerChartOuterRadius: 104,
    outerChartInnerRadius: 120,
    fontSizeTitle: "text-5xl",
    fontSizeDescription: "text-xl",
    fontSizeSubTitle: "text-xl",
    fontSizeSubDescription: "text-lg",
    totalQuantityPadding: 36,
    strokeWidth: 10,
  },
  xl: {
    width: 600,
    height: 750,
    innerChartOuterRadius: 131,
    outerChartInnerRadius: 150,
    fontSizeTitle: "text-6xl",
    fontSizeDescription: "text-2xl",
    fontSizeSubTitle: "text-2xl",
    fontSizeSubDescription: "text-xl",
    totalQuantityPadding: 45,
    strokeWidth: 10,
  },
} as const;

export function PieChartStacked({
  innerChartData,
  outerChartData,
  chartConfig,
  innerDataKey,
  outerDataKey,
  nameKey,
  labelKey,
  title,
  description,
  subTitle,
  subDescription,
  size = "md",
  customSize,
}: PieChartDonutWithTextProps) {
  const chartSize = customSize ?? CHART_SIZES[size];

  return (
    <Card
      className={`flex flex-col`}
      style={{ width: `${chartSize.width}px`, height: `${chartSize.height}px` }}
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
              content={
                <ChartTooltipContent
                  labelKey={labelKey}
                  nameKey={nameKey}
                  labelFormatter={(_, payload) => {
                    return chartConfig[
                      payload?.[0].dataKey as keyof typeof chartConfig
                    ].label;
                  }}
                />
              }
            />
            <Pie
              data={innerChartData}
              dataKey={innerDataKey}
              outerRadius={chartSize.innerChartOuterRadius}
            />
            <Pie
              data={outerChartData}
              dataKey={outerDataKey}
              innerRadius={chartSize.outerChartInnerRadius}
            />
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
