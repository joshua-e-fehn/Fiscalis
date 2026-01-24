import { CreateBrokerConnectionRequest } from "@/lib/types/brokers";

export async function getBrokerConnections() {
  const response = await fetch("/api/brokers/connections");

  if (!response.ok) {
    throw new Error("Failed to fetch broker connections");
  }

  return response.json();
}

export async function createBrokerConnection(
  data: CreateBrokerConnectionRequest,
) {
  const response = await fetch("/api/brokers/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (response.status === 409) {
      throw new Error(
        errorData.message || "You already have a connection to this broker",
      );
    }
    throw new Error(errorData.error || "Failed to create broker connection");
  }

  return response.json();
}

export async function deleteBrokerConnection(connectionId: number) {
  const response = await fetch(`/api/brokers/connections/${connectionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to delete broker connection");
  }

  return response.json();
}

export async function getBrokerPositions(connectionId?: number) {
  const url = connectionId
    ? `/api/brokers/positions?connectionId=${connectionId}`
    : "/api/brokers/positions";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch broker positions");
  }

  return response.json();
}

export async function syncBrokerConnection(connectionId: number) {
  const response = await fetch(
    `/api/brokers/connections/${connectionId}/sync`,
    {
      method: "POST",
    },
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to sync broker connection");
  }

  return response.json();
}
