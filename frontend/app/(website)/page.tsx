import { PieChartDonutWithText } from "@/components/atomic/atoms/pieCharts/donutWithText";
import { PieChartStacked } from "@/components/atomic/atoms/pieCharts/stacked";
const chartData = [
  { investmentType: "aktien", value: 1000, fill: "var(--color-aktien)" },
  { investmentType: "rohstoffe", value: 22400, fill: "var(--color-rohstoffe)" },
  { investmentType: "anleihen", value: 0, fill: "var(--color-anleihen)" },
  {
    investmentType: "immobilien",
    value: 0,
    fill: "var(--color-immobilien)",
  },
  { investmentType: "geldmarkt", value: 0, fill: "var(--color-geldmarkt)" },
  {
    investmentType: "kryptowaehrungen",
    value: 4900,
    fill: "var(--color-kryptowaehrungen)",
  },
  {
    investmentType: "sammelstuecke",
    value: 0,
    fill: "var(--color-sammelstuecke)",
  },
];
const goalChartData = [
  { investmentType: "aktien", goalValue: 1000, fill: "var(--color-aktien)" },
  {
    investmentType: "rohstoffe",
    goalValue: 1000,
    fill: "var(--color-rohstoffe)",
  },
  {
    investmentType: "anleihen",
    goalValue: 1000,
    fill: "var(--color-anleihen)",
  },
  {
    investmentType: "immobilien",
    goalValue: 1000,
    fill: "var(--color-immobilien)",
  },
  {
    investmentType: "geldmarkt",
    goalValue: 1000,
    fill: "var(--color-geldmarkt)",
  },
  {
    investmentType: "kryptowaehrungen",
    goalValue: 1000,
    fill: "var(--color-kryptowaehrungen)",
  },
  {
    investmentType: "sammelstuecke",
    goalValue: 1000,
    fill: "var(--color-sammelstuecke)",
  },
];

const chartConfig = {
  investment: {
    label: "Investment Type",
  },
  value: {
    label: "Current Value",
  },
  goalValue: {
    label: "Goal Value",
  },
  aktien: {
    label: "Aktien",
    color: "hsl(var(--chart-1))",
  },
  rohstoffe: {
    label: "Rohstoffe",
    color: "hsl(var(--chart-2))",
  },
  anleihen: {
    label: "Anleihen",
    color: "hsl(var(--chart-3))",
  },
  immobilien: {
    label: "Immobilien",
    color: "hsl(var(--chart-4))",
  },
  geldmarkt: {
    label: "Geldmarkt",
    color: "hsl(var(--chart-5))",
  },
  kryptowaehrungen: {
    label: "Kryptowährungen",
    color: "red",
  },
  sammelstuecke: {
    label: "Sammelstücke",
    color: "yellow",
  },
};

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="flex flex-row">
        <PieChartDonutWithText
          chartData={chartData}
          chartConfig={chartConfig}
          dataKey="value"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          isFinancial={true}
          size="sm"
        />
        <PieChartStacked
          innerChartData={chartData}
          outerChartData={goalChartData}
          chartConfig={chartConfig}
          innerDataKey="value"
          outerDataKey="goalValue"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          size="sm"
        />
      </div>
      <div className="flex flex-row">
        <PieChartDonutWithText
          chartData={chartData}
          chartConfig={chartConfig}
          dataKey="value"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          isFinancial={true}
          size="md"
        />
        <PieChartStacked
          innerChartData={chartData}
          outerChartData={goalChartData}
          chartConfig={chartConfig}
          innerDataKey="value"
          outerDataKey="goalValue"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          size="md"
        />
      </div>
      <div className="flex flex-row">
        <PieChartDonutWithText
          chartData={chartData}
          chartConfig={chartConfig}
          dataKey="value"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          isFinancial={true}
          size="lg"
        />
        <PieChartStacked
          innerChartData={chartData}
          outerChartData={goalChartData}
          chartConfig={chartConfig}
          innerDataKey="value"
          outerDataKey="goalValue"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          size="lg"
        />
      </div>
      <div className="flex flex-row">
        <PieChartDonutWithText
          chartData={chartData}
          chartConfig={chartConfig}
          dataKey="value"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          isFinancial={true}
          size="xl"
        />
        <PieChartStacked
          innerChartData={chartData}
          outerChartData={goalChartData}
          chartConfig={chartConfig}
          innerDataKey="value"
          outerDataKey="goalValue"
          nameKey="investmentType"
          labelKey="investment"
          title="Custom Title"
          description="Custom Description"
          subTitle="Custom Subtitle"
          subDescription="Custom Subdescription"
          size="xl"
        />
      </div>
    </main>
  );
}
