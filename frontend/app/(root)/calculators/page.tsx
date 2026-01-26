"use client";

import { useState, useEffect, useCallback } from "react";
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
  Calculator,
  LineChart,
  Clock,
  TrendingUp,
  DollarSign,
  Calendar,
  ArrowRight,
} from "lucide-react";
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

export default function FinancialCalculatorsPage() {
  return (
    <div className="container mx-auto py-10">
      <div className="flex flex-col items-center mb-10">
        <div className="flex items-center gap-2 mb-4">
          <Calculator className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Financial Calculators</h1>
        </div>
        <p className="text-muted-foreground text-center max-w-2xl">
          Powerful financial tools to help you make better investment decisions.
          Calculate compound interest, growth rates, future values, and more.
        </p>
      </div>

      <Tabs defaultValue="interest-rate" className="w-full max-w-4xl mx-auto">
        <TabsList className="grid grid-cols-4 mb-8">
          <TabsTrigger value="interest-rate">
            <TrendingUp className="w-4 h-4 mr-2" />
            Interest Rate
          </TabsTrigger>
          <TabsTrigger value="time-duration">
            <Clock className="w-4 h-4 mr-2" />
            Duration
          </TabsTrigger>
          <TabsTrigger value="future-value">
            <LineChart className="w-4 h-4 mr-2" />
            Future Value
          </TabsTrigger>
          <TabsTrigger value="starting-value">
            <DollarSign className="w-4 h-4 mr-2" />
            Starting Value
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
  const [initialValue, setInitialValue] = useState<number>(1000);
  const [finalValue, setFinalValue] = useState<number>(2000);
  const [startDate, setStartDate] = useState<string>(getTodayMinusOneYear());
  const [endDate, setEndDate] = useState<string>(getToday());
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");
  const [result, setResult] = useState<{
    compound: number;
    simple: number;
  } | null>(null);
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
    setResult(calculateResults());
    setHasCalculatedOnce(true);
  }

  // Auto-recalculate when inputs change
  useEffect(() => {
    if (hasCalculatedOnce) {
      setResult(calculateResults());
    }
  }, [hasCalculatedOnce, calculateResults]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculate Interest Rate</CardTitle>
        <CardDescription>
          Find the average interest rate between two points in time for both
          compound and simple interest
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="initial-value">Initial Value</Label>
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
              <Label htmlFor="final-value">Final Value</Label>
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
              <Label htmlFor="start-date">Start Date</Label>
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
              <Label htmlFor="end-date">End Date</Label>
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
            <div className="space-y-2">
              <Label htmlFor="time-interval">Interest Interval</Label>
              <Select
                value={timeInterval}
                onValueChange={(value) =>
                  setTimeInterval(value as TimeInterval)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">Minute</SelectItem>
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={calculate} className="w-full">
              Calculate
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Results</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Based on your inputs, here are the calculated interest rates
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Compound Interest
                    </div>
                    <div className="text-2xl font-bold">
                      {result.compound.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Per {timeInterval}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      Simple Interest
                    </div>
                    <div className="text-2xl font-bold">
                      {result.simple.toFixed(2)}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Per {timeInterval}
                    </div>
                  </div>
                </div>
              )}

              {!result && (
                <div className="flex items-center justify-center h-40 border-dashed border-2 rounded-md border-muted">
                  <p className="text-muted-foreground">
                    Enter values and calculate to see results
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimeDurationCalculator() {
  const [startingCapital, setStartingCapital] = useState<number>(1000);
  const [targetCapital, setTargetCapital] = useState<number>(2000);
  const [interestRate, setInterestRate] = useState<number>(5);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");
  const [result, setResult] = useState<{
    compound: number;
    simple: number;
  } | null>(null);
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
    setResult(calculateResults());
    setHasCalculatedOnce(true);
  }

  // Auto-recalculate when inputs change
  useEffect(() => {
    if (hasCalculatedOnce) {
      setResult(calculateResults());
    }
  }, [hasCalculatedOnce, calculateResults]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculate Time Duration</CardTitle>
        <CardDescription>
          Find out how long it will take to reach your target capital based on
          starting value and interest rate
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="starting-capital">Starting Capital</Label>
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
              <Label htmlFor="target-capital">Target Capital</Label>
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
              <Label htmlFor="interest-rate">Interest Rate (%)</Label>
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
              <Label htmlFor="time-interval">Interest Interval</Label>
              <Select
                value={timeInterval}
                onValueChange={(value) =>
                  setTimeInterval(value as TimeInterval)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">Minute</SelectItem>
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={calculate} className="w-full">
              Calculate
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Results</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Time needed to reach your target capital
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      With Compound Interest
                    </div>
                    <div className="text-2xl font-bold">
                      {result.compound.toFixed(2)} {timeInterval}s
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      With Simple Interest
                    </div>
                    <div className="text-2xl font-bold">
                      {result.simple.toFixed(2)} {timeInterval}s
                    </div>
                  </div>
                </div>
              )}

              {!result && (
                <div className="flex items-center justify-center h-40 border-dashed border-2 rounded-md border-muted">
                  <p className="text-muted-foreground">
                    Enter values and calculate to see results
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function FutureValueCalculator() {
  const [startingCapital, setStartingCapital] = useState<number>(1000);
  const [interestRate, setInterestRate] = useState<number>(5);
  const [timePeriod, setTimePeriod] = useState<number>(10);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");
  const [result, setResult] = useState<{
    compound: number;
    simple: number;
  } | null>(null);

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
    setResult(calculateResults());
    setHasCalculatedOnce(true);
  }

  useEffect(() => {
    if (hasCalculatedOnce) {
      setResult(calculateResults());
    }
  }, [hasCalculatedOnce, calculateResults]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculate Future Value</CardTitle>
        <CardDescription>
          Find out what your investment will be worth in the future based on
          interest rate and time
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="starting-capital">Starting Capital</Label>
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
              <Label htmlFor="interest-rate">Interest Rate (%)</Label>
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
              <Label htmlFor="time-period">Time Period ({timeInterval}s)</Label>
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
            <div className="space-y-2">
              <Label htmlFor="time-interval">Interest Interval</Label>
              <Select
                value={timeInterval}
                onValueChange={(value) =>
                  setTimeInterval(value as TimeInterval)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">Minute</SelectItem>
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={calculate} className="w-full">
              Calculate
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Results</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Projected future value of your investment
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      With Compound Interest
                    </div>
                    <div className="text-2xl font-bold">
                      ${result.compound.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Gain: ${(result.compound - startingCapital).toFixed(2)}{" "}
                      after {timePeriod} {timeInterval}
                      {timePeriod !== 1 ? "s" : ""}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      With Simple Interest
                    </div>
                    <div className="text-2xl font-bold">
                      ${result.simple.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Gain: ${(result.simple - startingCapital).toFixed(2)}{" "}
                      after {timePeriod} {timeInterval}
                      {timePeriod !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              )}

              {!result && (
                <div className="flex items-center justify-center h-40 border-dashed border-2 rounded-md border-muted">
                  <p className="text-muted-foreground">
                    Enter values and calculate to see results
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function StartingValueCalculator() {
  const [targetCapital, setTargetCapital] = useState<number>(2000);
  const [interestRate, setInterestRate] = useState<number>(5);
  const [timePeriod, setTimePeriod] = useState<number>(10);
  const [timeInterval, setTimeInterval] = useState<TimeInterval>("year");
  const [result, setResult] = useState<{
    compound: number;
    simple: number;
  } | null>(null);
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
    setResult(calculateResults());
    setHasCalculatedOnce(true);
  }

  // Auto-recalculate when inputs change
  useEffect(() => {
    if (hasCalculatedOnce) {
      setResult(calculateResults());
    }
  }, [hasCalculatedOnce, calculateResults]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Calculate Starting Value</CardTitle>
        <CardDescription>
          Find out how much you need to invest now to reach your target in the
          future
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="target-capital">Target Capital</Label>
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
              <Label htmlFor="interest-rate">Interest Rate (%)</Label>
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
              <Label htmlFor="time-period">Time Period ({timeInterval}s)</Label>
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
            <div className="space-y-2">
              <Label htmlFor="time-interval">Interest Interval</Label>
              <Select
                value={timeInterval}
                onValueChange={(value) =>
                  setTimeInterval(value as TimeInterval)
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select interval" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minute">Minute</SelectItem>
                  <SelectItem value="hour">Hour</SelectItem>
                  <SelectItem value="day">Day</SelectItem>
                  <SelectItem value="week">Week</SelectItem>
                  <SelectItem value="month">Month</SelectItem>
                  <SelectItem value="quarter">Quarter</SelectItem>
                  <SelectItem value="year">Year</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button onClick={calculate} className="w-full">
              Calculate
            </Button>
          </div>

          <div className="space-y-6 border-l pl-6">
            <div>
              <h3 className="text-lg font-medium mb-2">Results</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Required initial investment to reach your target
              </p>

              {result && (
                <div className="space-y-4">
                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      With Compound Interest
                    </div>
                    <div className="text-2xl font-bold">
                      ${result.compound.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Growth: ${(targetCapital - result.compound).toFixed(2)}{" "}
                      after {timePeriod} {timeInterval}
                      {timePeriod !== 1 ? "s" : ""}
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted p-4">
                    <div className="text-sm font-medium text-muted-foreground mb-1">
                      With Simple Interest
                    </div>
                    <div className="text-2xl font-bold">
                      ${result.simple.toFixed(2)}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      Growth: ${(targetCapital - result.simple).toFixed(2)}{" "}
                      after {timePeriod} {timeInterval}
                      {timePeriod !== 1 ? "s" : ""}
                    </div>
                  </div>
                </div>
              )}

              {!result && (
                <div className="flex items-center justify-center h-40 border-dashed border-2 rounded-md border-muted">
                  <p className="text-muted-foreground">
                    Enter values and calculate to see results
                  </p>
                </div>
              )}
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
