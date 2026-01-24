import { BrokersCard } from "@/components/atomic/organisms/brokersCard";

export default function BrokersPage() {
  return (
    <div className="container mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Brokers</h1>
        <p className="text-muted-foreground">
          Manage your brokerage connections and track your investment portfolio.
        </p>
      </div>

      <BrokersCard />
    </div>
  );
}
