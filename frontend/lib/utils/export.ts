import { Transaction } from "@/components/atomic/molecules/metals";

/**
 * Export transactions to CSV file
 */
export function exportTransactionsToCSV(
  transactions: Transaction[],
  filename: string = "metal-transactions.csv",
): void {
  const headers = [
    "Date",
    "Type",
    "Item",
    "Metal",
    "Quantity",
    "Price Per Unit",
    "Total",
    "Currency",
    "Spot Price",
    "Notes",
  ];

  const rows = transactions.map((tx) => [
    tx.transactionDate,
    tx.transactionType,
    tx.itemName,
    tx.metalType || "",
    tx.quantity.toString(),
    tx.pricePerUnit.toFixed(2),
    (tx.quantity * tx.pricePerUnit).toFixed(2),
    tx.currency,
    tx.spotPriceAtTransaction?.toFixed(2) || "",
    tx.notes || "",
  ]);

  // Escape values that contain commas or quotes
  const escapeCSV = (value: string): string => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map(escapeCSV).join(",")),
  ].join("\n");

  downloadFile(csvContent, filename, "text/csv;charset=utf-8;");
}

/**
 * Trigger file download in browser
 */
function downloadFile(
  content: string,
  filename: string,
  mimeType: string,
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";

  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
