import { PieChartDonutWithText } from "@/components/atomic/atoms/pieCharts/donutWithText";
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

const chartConfig = {
  visitors: {
    label: "Visitors",
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
      <PieChartDonutWithText
        chartData={chartData}
        chartConfig={chartConfig}
        dataKey="value"
        nameKey="investmentType"
        title="Custom Title"
        description="Custom Description"
        subTitle="Custom Subtitle"
        subDescription="Custom Subdescription"
        isFinancial={true}
        size="sm"
      />
      <PieChartDonutWithText
        chartData={chartData}
        chartConfig={chartConfig}
        dataKey="value"
        nameKey="investmentType"
        title="Custom Title"
        description="Custom Description"
        subTitle="Custom Subtitle"
        subDescription="Custom Subdescription"
        isFinancial={true}
        size="md"
      />
      <PieChartDonutWithText
        chartData={chartData}
        chartConfig={chartConfig}
        dataKey="value"
        nameKey="investmentType"
        title="Custom Title"
        description="Custom Description"
        subTitle="Custom Subtitle"
        subDescription="Custom Subdescription"
        isFinancial={true}
        size="lg"
      />
      <PieChartDonutWithText
        chartData={chartData}
        chartConfig={chartConfig}
        dataKey="value"
        nameKey="investmentType"
        title="Custom Title"
        description="Custom Description"
        subTitle="Custom Subtitle"
        subDescription="Custom Subdescription"
        isFinancial={true}
        size="xl"
      />
    </main>
  );
}
