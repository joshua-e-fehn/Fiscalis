import { Transaction } from "@/components/atomic/molecules/metals";

/** An opening balance's cost or date that was never entered */
const UNKNOWN = "unknown";

/**
 * Export transactions to CSV file; opening balances included, with an
 * unknown cost or date written as "unknown"
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
    "Opening Balance",
    "Notes",
  ];

  const rows = transactions.map((tx) => [
    tx.transactionDate ?? UNKNOWN,
    tx.transactionType,
    tx.itemName,
    tx.metalType || "",
    tx.quantity.toString(),
    tx.pricePerUnit === null ? UNKNOWN : tx.pricePerUnit.toFixed(2),
    tx.pricePerUnit === null
      ? UNKNOWN
      : (tx.quantity * tx.pricePerUnit).toFixed(2),
    tx.currency,
    tx.spotPriceAtTransaction?.toFixed(2) || "",
    tx.isOpening ? "yes" : "no",
    tx.notes || "",
  ]);

  downloadCSV(headers, rows, filename);
}

/** Quote a CSV cell when it contains a comma, quote or newline */
function escapeCSV(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Download rows as a UTF-8 CSV with a byte-order mark, so Excel reads
 * translated (non-ASCII) headers and values correctly; cells are quoted
 * when needed
 */
export function downloadCSV(
  headers: readonly string[],
  rows: readonly (readonly (string | number)[])[],
  filename: string,
): void {
  const csvContent = [
    headers.map(escapeCSV).join(","),
    ...rows.map((row) => row.map((cell) => escapeCSV(String(cell))).join(",")),
  ].join("\n");

  downloadFile("\uFEFF" + csvContent, filename, "text/csv;charset=utf-8;");
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
