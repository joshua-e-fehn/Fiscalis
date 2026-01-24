export async function getLinkToken() {
  const response = await fetch("/api/banking/create-link-token", {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error("Failed to fetch link token");
  }
  return response.json();
}

export async function getUpdateLinkToken(itemId: string) {
  const response = await fetch("/api/banking/create-update-link-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ itemId }),
  });
  if (!response.ok) {
    throw new Error("Failed to fetch update link token");
  }
  return response.json();
}

export async function exchangeToken(
  publicToken: string,
  institutionId?: string,
  institutionName?: string,
) {
  const response = await fetch("/api/banking/exchange-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ publicToken, institutionId, institutionName }),
  });

  if (!response.ok) {
    const data = await response.json();
    if (response.status === 409) {
      throw new Error(
        data.message || "You already have a connection to this bank",
      );
    }
    throw new Error("Failed to exchange token");
  }

  return response.json();
}

export async function deleteItem(itemId: string) {
  const response = await fetch(`/api/banking/items/${itemId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error("Delete item error:", response.status, errorData);
    throw new Error(errorData.error || "Failed to remove bank connection");
  }

  return response.json();
}

export async function getAccounts() {
  const response = await fetch("/api/banking/accounts");

  if (!response.ok) {
    throw new Error("Failed to fetch accounts");
  }

  return response.json();
}

export async function getAuth(itemId?: string) {
  const url = itemId ? `/api/banking/auth/${itemId}` : "/api/banking/auth";
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch auth data");
  }

  return response.json();
}

export async function getIdentity(itemId?: string) {
  const url = itemId
    ? `/api/banking/identity/${itemId}`
    : "/api/banking/identity";
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch identity data");
  }

  return response.json();
}

export async function getTransactions(
  startDate: Date | string,
  endDate: Date | string,
  itemId?: string,
) {
  // Convert dates to YYYY-MM-DD format if needed
  const formatDate = (date: Date | string): string => {
    if (typeof date === "string") return date;
    return date.toISOString().split("T")[0];
  };

  const params = new URLSearchParams({
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
  });

  if (itemId) {
    params.append("itemId", itemId);
  }

  const response = await fetch(
    `/api/banking/transactions?${params.toString()}`,
  );

  if (!response.ok) {
    throw new Error("Failed to fetch transactions");
  }

  return response.json();
}

export async function getTransactionsFromDB(limit?: number) {
  const params = new URLSearchParams();
  if (limit) {
    params.append("limit", limit.toString());
  }

  const url = `/api/banking/transactions/db${
    limit ? `?${params.toString()}` : ""
  }`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Failed to fetch transactions from database");
  }

  return response.json();
}

export async function getBalanceSummary() {
  const response = await fetch("/api/banking/balances/summary");

  if (!response.ok) {
    throw new Error("Failed to fetch balance summary");
  }

  return response.json();
}

export async function refreshTransactions() {
  const response = await fetch("/api/banking/transactions/refresh", {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error("Failed to refresh transactions");
  }

  return response.json();
}
