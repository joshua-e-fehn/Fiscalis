"use client";

import * as React from "react";
import { useRef, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { FileUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/shadcn/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import {
  useDeleteDepotTrade,
  useDepotTrades,
  useImportDepotTrades,
} from "@/hooks/convex/depotTrades";
import { useErrorMessage } from "@/i18n/errors";
import { formatCurrency } from "@/lib/utils/currency";
import { parseDkbCsv } from "@/../services/banking/dkbCsv";

/** The longest export read in the browser (a decade of bookings is ~3 MB). */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

/**
 * Imports the depot trades of a DKB account export (Umsatzliste CSV),
 * which Plaid does not deliver. The file is read in the browser; only the
 * depot trades are sent (convex/depotTrades.ts).
 */
export function DepotImportCard() {
  const t = useTranslations("integrations.banking.depotImport");
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const trades = useDepotTrades();
  const importTrades = useImportDepotTrades();
  const deleteTrade = useDeleteDepotTrade();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string }>();

  async function onFile(file: File) {
    setStatus(undefined);
    if (file.size > MAX_FILE_BYTES) {
      setStatus({ kind: "error", text: t("tooLarge") });
      return;
    }
    // DKB exports UTF-8; an older export may be Latin-1, which only
    // mangles umlauts the parser does not need
    const parsed = parseDkbCsv(await file.text());
    if (!parsed) {
      setStatus({ kind: "error", text: t("notDkb") });
      return;
    }
    if (parsed.trades.length === 0) {
      setStatus({ kind: "ok", text: t("noTrades", { rows: parsed.rows }) });
      return;
    }
    setBusy(true);
    try {
      const result = await importTrades({
        trades: parsed.trades,
      });
      setStatus({
        kind: "ok",
        text: t("imported", {
          trades: parsed.trades.length,
          added: result.added,
        }),
      });
    } catch (error) {
      setStatus({ kind: "error", text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <FileUp className="me-2 h-4 w-4" />
          {busy ? t("importing") : t("import")}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void onFile(file);
          }}
        />
      </CardHeader>
      <CardContent className="space-y-4">
        {status && (
          <p
            role="status"
            className={
              status.kind === "error"
                ? "text-sm text-destructive"
                : "text-sm text-muted-foreground"
            }
          >
            {status.text}
          </p>
        )}
        {trades && trades.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("columns.date")}</TableHead>
                  <TableHead>{t("columns.security")}</TableHead>
                  <TableHead>{t("columns.side")}</TableHead>
                  <TableHead className="text-end">{t("columns.units")}</TableHead>
                  <TableHead className="text-end">{t("columns.amount")}</TableHead>
                  <TableHead className="w-[40px]">
                    <span className="sr-only">{t("columns.actions")}</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trades.map((trade) => (
                  <TableRow key={trade._id}>
                    <TableCell className="whitespace-nowrap">
                      {format.dateTime(new Date(`${trade.tradeDate}T00:00:00Z`), {
                        dateStyle: "medium",
                        timeZone: "UTC",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{trade.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {trade.isin}
                      </div>
                    </TableCell>
                    <TableCell>
                      {trade.side === "buy" ? t("buy") : t("sell")}
                    </TableCell>
                    <TableCell className="text-end font-mono text-sm">
                      {format.number(trade.quantity, { maximumFractionDigits: 4 })}
                    </TableCell>
                    <TableCell className="text-end font-mono text-sm">
                      {formatCurrency(trade.cash, trade.currency)}
                    </TableCell>
                    <TableCell className="p-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("remove", { name: trade.name })}
                        onClick={() =>
                          deleteTrade({ tradeId: trade._id }).catch((error) =>
                            setStatus({ kind: "error", text: errorMessage(error) }),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
