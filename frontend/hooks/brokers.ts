import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as brokersApi from "@/lib/api/brokers";
import {
  BrokerConnection,
  BrokerPosition,
  CreateBrokerConnectionRequest,
} from "@/lib/types/brokers";

// Query Keys
export const brokersKeys = {
  all: ["brokers"] as const,
  connections: () => [...brokersKeys.all, "connections"] as const,
  connection: (id: number) => [...brokersKeys.connections(), id] as const,
  positions: () => [...brokersKeys.all, "positions"] as const,
  positionsByConnection: (connectionId: number) =>
    [...brokersKeys.positions(), connectionId] as const,
};

// Get all broker connections
export function useBrokerConnections() {
  return useQuery({
    queryKey: brokersKeys.connections(),
    queryFn: brokersApi.getBrokerConnections,
    staleTime: 5 * 60 * 1000, // 5 minutes
    select: (data) => data.connections as BrokerConnection[],
  });
}

// Create broker connection
export function useCreateBrokerConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateBrokerConnectionRequest) =>
      brokersApi.createBrokerConnection(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brokersKeys.connections() });
    },
    onError: (error) => {
      console.error("Failed to create broker connection:", error);
    },
  });
}

// Delete broker connection
export function useDeleteBrokerConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (connectionId: number) =>
      brokersApi.deleteBrokerConnection(connectionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: brokersKeys.connections() });
      queryClient.invalidateQueries({ queryKey: brokersKeys.positions() });
    },
    onError: (error) => {
      console.error("Failed to delete broker connection:", error);
    },
  });
}

// Get broker positions
export function useBrokerPositions(connectionId?: number) {
  return useQuery({
    queryKey: connectionId
      ? brokersKeys.positionsByConnection(connectionId)
      : brokersKeys.positions(),
    queryFn: () => brokersApi.getBrokerPositions(connectionId),
    staleTime: 60 * 1000, // 1 minute
    select: (data) => data.positions as BrokerPosition[],
  });
}

// Sync broker connection
export function useSyncBrokerConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (connectionId: number) =>
      brokersApi.syncBrokerConnection(connectionId),
    onSuccess: (_, connectionId) => {
      queryClient.invalidateQueries({
        queryKey: brokersKeys.connection(connectionId),
      });
      queryClient.invalidateQueries({ queryKey: brokersKeys.positions() });
    },
    onError: (error) => {
      console.error("Failed to sync broker connection:", error);
    },
  });
}
