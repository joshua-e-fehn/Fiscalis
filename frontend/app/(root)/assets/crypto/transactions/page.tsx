"use client";

/**
 * Crypto Assets Transactions Page
 *
 * Complete transaction history across all connected crypto accounts.
 */

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/shadcn/card";
import { Button } from "@/components/ui/shadcn/button";
import {
  useCryptoTransactions,
  useHasCryptoHoldings,
} from "@/hooks/convex/crypto";
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  ArrowRight,
  History,
} from "lucide-react";
import Link from "next/link";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils/currency";
import { isolateLtr } from "@/../services/i18n/bidi";

/** Provider transaction types with a translated name; others show as stored */
const KNOWN_TYPES = [
  "buy",
  "sell",
  "deposit",
  "withdraw",
  "withdrawal",
  "receive",
  "send",
  "transfer",
  "reward",
  "staking",
  "dividend",
  "interest",
  "fee",
] as const;

function isKnownType(type: string): type is (typeof KNOWN_TYPES)[number] {
  return (KNOWN_TYPES as readonly string[]).includes(type);
}

const MINUTE_MS = 60_000;
const WEEK_MS = 7 * 24 * 60 * MINUTE_MS;

/**
 * When a transaction happened: "just now" under a minute, relative time
 * ("5 hours ago") under a week, else the date. A date-only value
 * (YYYY-MM-DD) is shown as that calendar day.
 */
function useTransactionDateLabel() {
  const t = useTranslations("assets.crypto.transactions");
  const format = useFormatter();
  // Re-rendered every minute so the relative time stays current
  const now = useNow({ updateInterval: MINUTE_MS });

  return (dateIso: string): string => {
    const timestamp = new Date(dateIso).getTime();
    if (Number.isNaN(timestamp)) return t("unknownDate");
    const elapsed = now.getTime() - timestamp;
    if (elapsed < MINUTE_MS) return t("justNow");
    if (elapsed < WEEK_MS) return format.relativeTime(timestamp, now);
    return format.dateTime(
      timestamp,
      /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? "dateOnly" : "date",
    );
  };
}

export default function CryptoAssetsTransactionsPage() {
  const transactions = useCryptoTransactions(100);
  const hasConnections = useHasCryptoHoldings();
  const t = useTranslations("assets.crypto.transactions");
  const tAction = useTranslations("assets.actions");
  const dateLabel = useTransactionDateLabel();
  const typeLabel = (type: string) => {
    const key = type?.toLowerCase();
    return isKnownType(key) ? t(`types.${key}`) : type;
  };

  // Format a value in the transaction's own currency (broker
  // transactions are often USD, so a fixed EUR would mislabel them)
  const formatValue = (
    value: number | null | undefined,
    currency: string | null | undefined,
  ) => {
    if (value === null || value === undefined) return "-";
    // An ISO 4217-shaped code ("EUR", "GBP"): the shared formatter, the
    // symbol or code after the amount
    if (currency && /^[a-z]{3}$/i.test(currency)) {
      return formatCurrency(value, currency);
    }
    // No code given, or not a currency code: show the bare amount, left to
    // right in RTL too
    return isolateLtr(`${value.toLocaleString("de-CH")} ${currency ?? ""}`.trim());
  };

  // Get transaction icon
  const getTransactionIcon = (type: string) => {
    switch (type?.toLowerCase()) {
      case "buy":
      case "deposit":
      case "receive":
        return <ArrowDownLeft className="h-4 w-4 text-green-500" />;
      case "sell":
      case "withdraw":
      case "send":
        return <ArrowUpRight className="h-4 w-4 text-red-500" />;
      default:
        return <RefreshCw className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (!hasConnections) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("connectDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <p className="mb-4">{t("notConnected")}</p>
              <Button variant="outline" asChild>
                <Link href="/integrations/brokers">
                  {tAction("connectCrypto")}
                  <ArrowRight className="ms-2 h-4 w-4 rtl:-scale-x-100" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t("title")}
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {transactions && transactions.length > 0 ? (
            <div className="space-y-4">
              {transactions.map((tx, index) => (
                <div
                  key={tx._id || index}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-muted">
                      {getTransactionIcon(tx.type)}
                    </div>
                    <div>
                      <div className="font-medium flex items-center gap-2">
                        <span className="capitalize">{typeLabel(tx.type)}</span>
                        <span className="text-muted-foreground">
                          {tx.symbol}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {tx.date ? dateLabel(tx.date) : t("unknownDate")}
                      </div>
                    </div>
                  </div>
                  <div className="text-end">
                    <div className="font-medium">
                      {isolateLtr(
                        `${tx.quantity?.toFixed(6) ?? ""} ${tx.symbol ?? ""}`.trim(),
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {formatValue(tx.value, tx.currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>{t("empty")}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
