"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Skeleton } from "@/components/ui/shadcn/skeleton";
import { TrendingUp } from "lucide-react";
import { useBrokerConnections } from "@/hooks/convex/brokers";
import { BrokerConnectionCard } from "@/components/atomic/atoms/brokerConnectionCard";
import { AddBrokerButton } from "@/components/atomic/atoms/addBrokerButton";

export function BrokerConnectionsCard() {
  const connections = useBrokerConnections();

  // Convex returns undefined while loading
  const isLoading = connections === undefined;
  const error = null; // Convex throws on error

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-28" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Broker Connections
          </CardTitle>
          <CardDescription>Manage your brokerage connections</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-900 dark:bg-red-950/20">
            <p className="text-sm text-red-800 dark:text-red-200">
              Failed to load broker connections. Please try again later.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const hasConnections = connections && connections.length > 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Broker Connections
            </CardTitle>
            <CardDescription>
              {hasConnections
                ? `${connections.length} broker${
                    connections.length === 1 ? "" : "s"
                  } connected`
                : "Connect your brokerage accounts to track investments"}
            </CardDescription>
          </div>
          <AddBrokerButton />
        </div>
      </CardHeader>
      <CardContent>
        {hasConnections ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {connections.map((connection: (typeof connections)[number]) => (
              <BrokerConnectionCard
                key={connection._id}
                connection={connection}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <TrendingUp className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No brokers connected</h3>
            <p className="mt-2 max-w-sm text-sm text-muted-foreground">
              Connect your brokerage account to automatically track your
              investments and portfolio performance.
            </p>
            <div className="mt-6">
              <AddBrokerButton />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
