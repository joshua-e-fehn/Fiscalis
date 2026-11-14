"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/shadcn/tabs";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import { Button } from "@/components/ui/shadcn/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  LineChart,
  Clock,
  TrendingUp,
  DollarSign,
  Calendar,
} from "lucide-react";
import { PageHeader } from "@/components/atomic/molecules/investments";
import {
  calculateAverageCompoundInterest,
  calculateAverageInterest,
  calculateCapitalGainDurationWithCompoundInterest,
  calculateCapitalGainDurationWithInterest,
  calculateEndCapitalValueWithCompoundInterest,
  calculateEndCapitalValueWithInterest,
  calculateStartCapitalValueWithCompoundInterest,
  calculateStartCapitalValueWithInterest,
  TimeInterval,
} from "@/../services/finance/financeService";
import { useDisplayCurrency } from "@/hooks/convex/displayCurrency";
import { formatCurrency } from "@/lib/utils/currency";

/**
 * The amounts are user input: labelled with the display currency, as the
 * loan calculator does, and never converted.
 */
function useFormatAmount() {
  const { currency } = useDisplayCurrency();
  return (value: number) => formatCurrency(value, currency);
}

const TIME_INTERVALS: TimeInterval[] = [
  "minute",
  "hour",
  "day",
  "week",
  "month",
  "quarter",
  "year",
];

/** A count rounded to two decimals, for "12.34 years". */
function roundCount(value: number): number {
  return Math.round(value * 100) / 100;
}

function IntervalSelect({
  value,
  onChange,
}: {
  value: TimeInterval;
  onChange: (value: TimeInterval) => void;
}) {
  const t = useTranslations("calculators");
  return (
    <div className="space-y-2">
      <Label htmlFor="time-interval">{t("interest.fields.interval")}</Label>
      <Select
        value={value}
        onValueChange={(next) => onChange(next as TimeInterval)}
      >
        <SelectTrigger id="time-interval">
          <SelectValue placeholder={t("interest.fields.intervalPlaceholder")} />
        </SelectTrigger>
        <SelectContent>
          {TIME_INTERVALS.map((interval) => (
            <SelectItem key={interval} value={interval}>
              {t(`intervals.label.${interval}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function EmptyResults() {
  const t = useTranslations("calculators.interest");
  return (
    <div className="flex items-center justify-center h-40 border-dashed border-2 rounded-md border-muted">
      <p className="text-muted-foreground">{t("empty")}</p>
    </div>
  );
}

export default function FinancialCalculatorsPage() {
  const t = useTranslations("calculators.interest");
  return (
    <div className="container mx-auto py-6 space-y-6">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      <Tabs defaultValue="interest-rate" className="w-full">
        <TabsList className="grid grid-cols-4 mb-8 max-w-2xl">
          <TabsTrigger value="interest-rate">
            <TrendingUp className="w-4 h-4 mr-2" />
            {t("tabs.rate")}
          </TabsTrigger>
          <TabsTrigger value="time-duration">
            <Clock className="w-4 h-4 mr-2" />
            {t("tabs.duration")}
          </TabsTrigger>
          <TabsTrigger value="future-value">
            <LineChart className="w-4 h-4 mr-2" />
            {t("tabs.futureValue")}
          </TabsTrigger>
          <TabsTrigger value="starting-value">
            <DollarSign className="w-4 h-4 mr-2" />
            {t("tabs.startingValue")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="interest-rate">
          <InterestRateCalculator />
        </TabsContent>

        <TabsContent value="time-duration">
          <TimeDurationCalculator />
        </TabsContent>

        <TabsContent value="future-value">
          <FutureValueCalculator />
        </TabsContent>

        <TabsContent value="starting-value">
          <StartingValueCalculator />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InterestRateCalculator() {
  const t = useTranslations("calculators.interest");
  const tIntervals = useTranslations("calculators.intervals");
  const [initialValue, setInitialValue] = useState<number>(1000);
  const [finalValue, setFinalValue] = useState<number>(2000);
  const [startDate, setStartDate] = useState<string>(getTodayMinusOneYear());
  const [endDate, setEndDate] = useState<string>(getToday());
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");
  const [hasCalculatedOnce, setHasCalculatedOnce] = useState<boolean>(false);

  // Function to calculate results with useCallback
  const calculateResults = useCallback(() => {
    const pointA = {
      time: new Date(startDate),
      capitalValue: Number(initialValue),
    };

    const pointB = {
      time: new Date(endDate),
      capitalValue: Number(finalValue),
    };

    const compoundInterest = calculateAverageCompoundInterest(
      pointA,
      pointB,
      timeInterval,
    );
    const simpleInterest = calculateAverageInterest(
      pointA,
      pointB,
      timeInterval,
    );

    return {
      compound: Number(compoundInterest) * 100,
      simple: Number(simpleInterest) * 100,
    };
  }, [initialValue, finalValue, startDate, endDate, timeInterval]);

  // Manual calculation button handler
  function calculate() {
    setHasCalculatedOnce(true);
  }

  // Derived from the current inputs once the user has calculated
  const result = useMemo(
    () => (hasCalculatedOnce ? calculateResults() : null),
    [hasCalculatedOnce, calculateResults],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("rate.title")}</CardTitle>
        <CardDescription>{t("rate.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="initial-value">{t("fields.initialValue")}</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="initial-value"
                  type="number"
                  placeholder="1000"
                  value={initialValue}
                  onChange={(e) => setInitialValue(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="final-value">{t("fields.finalValue")}</Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="final-value"
                  type="number"
                  placeholder="2000"
                  value={finalValue}
                  onChange={(e) => setFinalValue(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="start-date">{t("fields.startDate")}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">{t("fields.endDate")}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <IntervalSelect value={timeInterval} onChange={setTimeInterval} />

            <Button onClick={calculate} className="w-full">
              {t("calculate")}
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">{t("results")}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("rate.resultsHint")}
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("compoundInterest")}
                    </div>
                    <div className="text-2xl font-bold">
                      {result.compound.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tIntervals(`per.${timeInterval}`)}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("simpleInterest")}
                    </div>
                    <div className="text-2xl font-bold">
                      {result.simple.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tIntervals(`per.${timeInterval}`)}
                    </div>
                  </div>
                </div>
              )}

              {!result && <EmptyResults />}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeDurationCalculator() {
  const t = useTranslations("calculators.interest");
  const tIntervals = useTranslations("calculators.intervals");
  const [startingCapital, setStartingCapital] = useState<number>(1000);
  const [targetCapital, setTargetCapital] = useState<number>(2000);
  const [interestRate, setInterestRate] = useState<number>(5);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");
  const [hasCalculatedOnce, setHasCalculatedOnce] = useState<boolean>(false);

  // Function to calculate results with useCallback
  const calculateResults = useCallback(() => {
    const interestRateDecimal = interestRate / 100;

    const compoundDuration = calculateCapitalGainDurationWithCompoundInterest(
      startingCapital,
      targetCapital,
      interestRateDecimal,
    );

    const simpleDuration = calculateCapitalGainDurationWithInterest(
      startingCapital,
      targetCapital,
      interestRateDecimal,
    );

    return {
      compound: compoundDuration,
      simple: simpleDuration,
    };
  }, [startingCapital, targetCapital, interestRate]);

  // Manual calculation button handler
  function calculate() {
    setHasCalculatedOnce(true);
  }

  // Derived from the current inputs once the user has calculated
  const result = useMemo(
    () => (hasCalculatedOnce ? calculateResults() : null),
    [hasCalculatedOnce, calculateResults],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("duration.title")}</CardTitle>
        <CardDescription>{t("duration.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="starting-capital">
                {t("fields.startingCapital")}
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="starting-capital"
                  type="number"
                  placeholder="1000"
                  value={startingCapital}
                  onChange={(e) => setStartingCapital(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="target-capital">
                {t("fields.targetCapital")}
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="target-capital"
                  type="number"
                  placeholder="2000"
                  value={targetCapital}
                  onChange={(e) => setTargetCapital(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interest-rate">{t("fields.interestRate")}</Label>
              <div className="relative">
                <TrendingUp className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="interest-rate"
                  type="number"
                  step="0.01"
                  placeholder="5"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <IntervalSelect value={timeInterval} onChange={setTimeInterval} />

            <Button onClick={calculate} className="w-full">
              {t("calculate")}
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">{t("results")}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("duration.resultsHint")}
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("withCompound")}
                    </div>
                    <div className="text-2xl font-bold">
                      {tIntervals(`count.${timeInterval}`, {
                        count: roundCount(result.compound),
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("withSimple")}
                    </div>
                    <div className="text-2xl font-bold">
                      {tIntervals(`count.${timeInterval}`, {
                        count: roundCount(result.simple),
                      })}
                    </div>
                  </div>
                </div>
              )}

              {!result && <EmptyResults />}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FutureValueCalculator() {
  const t = useTranslations("calculators.interest");
  const tIntervals = useTranslations("calculators.intervals");
  const formatAmount = useFormatAmount();
  const [startingCapital, setStartingCapital] = useState<number>(1000);
  const [interestRate, setInterestRate] = useState<number>(5);
  const [timePeriod, setTimePeriod] = useState<number>(10);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");

  const [hasCalculatedOnce, setHasCalculatedOnce] = useState<boolean>(false);

  // Function to calculate results
  const calculateResults = useCallback(() => {
    const interestRateDecimal = interestRate / 100;

    const compoundFutureValue = calculateEndCapitalValueWithCompoundInterest(
      startingCapital,
      interestRateDecimal,
      timePeriod,
    );

    const simpleFutureValue = calculateEndCapitalValueWithInterest(
      startingCapital,
      interestRateDecimal,
      timePeriod,
    );

    return {
      compound: compoundFutureValue,
      simple: simpleFutureValue,
    };
  }, [startingCapital, interestRate, timePeriod]); // memoize based on these dependencies

  // Manual calculation button handler
  function calculate() {
    setHasCalculatedOnce(true);
  }

  // Derived from the current inputs once the user has calculated
  const result = useMemo(
    () => (hasCalculatedOnce ? calculateResults() : null),
    [hasCalculatedOnce, calculateResults],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("futureValue.title")}</CardTitle>
        <CardDescription>{t("futureValue.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="starting-capital">
                {t("fields.startingCapital")}
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="starting-capital"
                  type="number"
                  placeholder="1000"
                  value={startingCapital}
                  onChange={(e) => setStartingCapital(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interest-rate">{t("fields.interestRate")}</Label>
              <div className="relative">
                <TrendingUp className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="interest-rate"
                  type="number"
                  step="0.01"
                  placeholder="5"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-period">
                {t("fields.timePeriod", {
                  unit: tIntervals(`unitPlural.${timeInterval}`),
                })}
              </Label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="time-period"
                  type="number"
                  placeholder="10"
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <IntervalSelect value={timeInterval} onChange={setTimeInterval} />

            <Button onClick={calculate} className="w-full">
              {t("calculate")}
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">{t("results")}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("futureValue.resultsHint")}
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("withCompound")}
                    </div>
                    <div className="text-2xl font-bold">
                      {formatAmount(result.compound)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("gainAfter", {
                        amount: formatAmount(result.compound - startingCapital),
                        duration: tIntervals(`countAfter.${timeInterval}`, {
                          count: timePeriod,
                        }),
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("withSimple")}
                    </div>
                    <div className="text-2xl font-bold">
                      {formatAmount(result.simple)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("gainAfter", {
                        amount: formatAmount(result.simple - startingCapital),
                        duration: tIntervals(`countAfter.${timeInterval}`, {
                          count: timePeriod,
                        }),
                      })}
                    </div>
                  </div>
                </div>
              )}

              {!result && <EmptyResults />}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StartingValueCalculator() {
  const t = useTranslations("calculators.interest");
  const tIntervals = useTranslations("calculators.intervals");
  const formatAmount = useFormatAmount();
  const [targetCapital, setTargetCapital] = useState<number>(2000);
  const [interestRate, setInterestRate] = useState<number>(5);
  const [timePeriod, setTimePeriod] = useState<number>(10);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");
  const [hasCalculatedOnce, setHasCalculatedOnce] = useState<boolean>(false);

  // Function to calculate results with useCallback
  const calculateResults = useCallback(() => {
    const interestRateDecimal = interestRate / 100;

    const compoundStartingValue =
      calculateStartCapitalValueWithCompoundInterest(
        targetCapital,
        interestRateDecimal,
        timePeriod,
      );

    const simpleStartingValue = calculateStartCapitalValueWithInterest(
      targetCapital,
      interestRateDecimal,
      timePeriod,
    );

    return {
      compound: compoundStartingValue,
      simple: simpleStartingValue,
    };
  }, [targetCapital, interestRate, timePeriod]);

  // Manual calculation button handler
  function calculate() {
    setHasCalculatedOnce(true);
  }

  // Derived from the current inputs once the user has calculated
  const result = useMemo(
    () => (hasCalculatedOnce ? calculateResults() : null),
    [hasCalculatedOnce, calculateResults],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("startingValue.title")}</CardTitle>
        <CardDescription>{t("startingValue.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-capital">
                {t("fields.targetCapital")}
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="target-capital"
                  type="number"
                  placeholder="2000"
                  value={targetCapital}
                  onChange={(e) => setTargetCapital(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="interest-rate">{t("fields.interestRate")}</Label>
              <div className="relative">
                <TrendingUp className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="interest-rate"
                  type="number"
                  step="0.01"
                  placeholder="5"
                  value={interestRate}
                  onChange={(e) => setInterestRate(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="time-period">
                {t("fields.timePeriod", {
                  unit: tIntervals(`unitPlural.${timeInterval}`),
                })}
              </Label>
              <div className="relative">
                <Clock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="time-period"
                  type="number"
                  placeholder="10"
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(Number(e.target.value))}
                  className="pl-9"
                />
              </div>
            </div>
            <IntervalSelect value={timeInterval} onChange={setTimeInterval} />

            <Button onClick={calculate} className="w-full">
              {t("calculate")}
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">{t("results")}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {t("startingValue.resultsHint")}
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("withCompound")}
                    </div>
                    <div className="text-2xl font-bold">
                      {formatAmount(result.compound)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("growthAfter", {
                        amount: formatAmount(targetCapital - result.compound),
                        duration: tIntervals(`countAfter.${timeInterval}`, {
                          count: timePeriod,
                        }),
                      })}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      {t("withSimple")}
                    </div>
                    <div className="text-2xl font-bold">
                      {formatAmount(result.simple)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {t("growthAfter", {
                        amount: formatAmount(targetCapital - result.simple),
                        duration: tIntervals(`countAfter.${timeInterval}`, {
                          count: timePeriod,
                        }),
                      })}
                    </div>
                  </div>
                </div>
              )}

              {!result && <EmptyResults />}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Helper functions
function getToday() {
  return new Date().toISOString().split("T")[0];
}

function getTodayMinusOneYear() {
  const date = new Date();
  date.setFullYear(date.getFullYear() - 1);
  return date.toISOString().split("T")[0];
}
