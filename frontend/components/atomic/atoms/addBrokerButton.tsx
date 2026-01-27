"use client";

import { useState } from "react";
import { Button } from "@/components/ui/shadcn/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/shadcn/dialog";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import { Plus, TrendingUp } from "lucide-react";
import { useCreateBrokerConnection } from "@/hooks/convex/brokers";

// Broker types
type BrokerType =
  | "interactive_brokers"
  | "degiro"
  | "trade_republic"
  | "scalable_capital";

const AVAILABLE_BROKERS = [
  {
    type: "interactive_brokers" as BrokerType,
    name: "Interactive Brokers",
    description: "Professional trading platform with global market access",
    supported: true,
    comingSoon: false,
  },
  {
    type: "degiro" as BrokerType,
    name: "DEGIRO",
    description: "European low-cost broker",
    supported: false,
    comingSoon: true,
  },
  {
    type: "trade_republic" as BrokerType,
    name: "Trade Republic",
    description: "German mobile broker",
    supported: false,
    comingSoon: true,
  },
  {
    type: "scalable_capital" as BrokerType,
    name: "Scalable Capital",
    description: "Digital wealth management",
    supported: false,
    comingSoon: true,
  },
];

export function AddBrokerButton() {
  const [open, setOpen] = useState(false);
  const [brokerType, setBrokerType] = useState<BrokerType>(
    "interactive_brokers",
  );
  const [connectionName, setConnectionName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [username, setUsername] = useState("");

  const createConnection = useCreateBrokerConnection();

  const selectedBroker = AVAILABLE_BROKERS.find(
    (b: (typeof AVAILABLE_BROKERS)[number]) => b.type === brokerType,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createConnection.mutate({
        brokerType,
        connectionName: connectionName || selectedBroker?.name || "My Broker",
        accountId: accountId || undefined,
        username: username || undefined,
      });

      // Reset form and close dialog
      setConnectionName("");
      setAccountId("");
      setUsername("");
      setOpen(false);
    } catch (error) {
      // Error handling is done in the mutation
      console.error("Failed to add broker:", error);
    }
  };

  const resetForm = () => {
    setConnectionName("");
    setAccountId("");
    setUsername("");
    setBrokerType("interactive_brokers");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen: boolean) => {
        setOpen(isOpen);
        if (!isOpen) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          Add Broker
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Connect a Broker
            </DialogTitle>
            <DialogDescription>
              Connect your brokerage account to track your investments and
              portfolio.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="broker-type">Broker</Label>
              <Select
                value={brokerType}
                onValueChange={(value) => setBrokerType(value as BrokerType)}
              >
                <SelectTrigger id="broker-type">
                  <SelectValue placeholder="Select a broker" />
                </SelectTrigger>
                <SelectContent>
                  {AVAILABLE_BROKERS.map(
                    (broker: (typeof AVAILABLE_BROKERS)[number]) => (
                      <SelectItem
                        key={broker.type}
                        value={broker.type}
                        disabled={!broker.supported}
                      >
                        <div className="flex items-center gap-2">
                          <span>{broker.name}</span>
                          {broker.comingSoon && (
                            <span className="text-xs text-muted-foreground">
                              (Coming Soon)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
              {selectedBroker && (
                <p className="text-sm text-muted-foreground">
                  {selectedBroker.description}
                </p>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="connection-name">Connection Name</Label>
              <Input
                id="connection-name"
                placeholder={`My ${selectedBroker?.name || "Broker"}`}
                value={connectionName}
                onChange={(e) => setConnectionName(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                A friendly name to identify this connection
              </p>
            </div>

            {brokerType === "interactive_brokers" && (
              <>
                <div className="grid gap-2">
                  <Label htmlFor="account-id">Account ID (Optional)</Label>
                  <Input
                    id="account-id"
                    placeholder="U1234567"
                    value={accountId}
                    onChange={(e) => setAccountId(e.target.value)}
                  />
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="username">Username (Optional)</Label>
                  <Input
                    id="username"
                    placeholder="Your IB username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>

                <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-900 dark:bg-yellow-950/20">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200">
                    <strong>Note:</strong> Interactive Brokers API integration
                    is coming soon. For now, you can add the connection to track
                    it in your dashboard.
                  </p>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createConnection.isLoading}>
              {createConnection.isLoading ? "Adding..." : "Add Broker"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
