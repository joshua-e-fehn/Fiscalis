"use client";

/**
 * Bank transactions (ENG-190): filters (account, date range, description
 * search), a paginated table in each account's currency, and the empty
 * states for no bank, no transactions yet and no matches.
 */

import * as React from "react";
import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  ChevronDown,
  Loader2,
  Receipt,
  SearchX,
} from "lucide-react";
import { Badge } from "@/components/ui/shadcn/badge";
import { Button } from "@/components/ui/shadcn/button";
import { Card, CardContent } from "@/components/ui/shadcn/card";
import { Input } from "@/components/ui/shadcn/input";
import { Label } from "@/components/ui/shadcn/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/shadcn/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/shadcn/table";
import { IntegrationEmptyState } from "@/components/atomic/molecules/integrations";
import { PlaidLinkButton } from "@/components/atomic/atoms/plaidLinkButton";
import {
  TRANSACTIONS_PAGE_SIZE,
  usePlaidAccounts,
  usePlaidItems,
  useTransactions,
} from "@/hooks/convex";
import { formatCurrency } from "@/lib/utils/currency";
import { cn } from "@/lib/utils";
import {
  normalizeDateRange,
  signedTransactionAmount,
  transactionCurrency,
  transactionDirection,
} from "@/../services/banking/transactionDisplay";

const ALL_ACCOUNTS = "all";
const SEARCH_DEBOUNCE_MS = 300;

interface BankTransactionsProps {
  /** Sync button for the "no transactions yet" state */
  syncAction: React.ReactNode;
}

export function BankTransactions({ syncAction }: BankTransactionsProps) {
  const t = useTranslations("integrations.banking.transactions");
  const format = useFormatter();
  const items = usePlaidItems();
  const accounts = usePlaidAccounts();

  const [accountId, setAccountId] = useState(ALL_ACCOUNTS);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(
      () => setSearch(searchInput.trim()),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchInput]);

  const { startDate, endDate } = normalizeDateRange(from, to);
  const filtered =
    accountId !== ALL_ACCOUNTS || !!startDate || !!endDate || !!search;

  const { results, status, loadMore } = useTransactions({
    accountId: accountId === ALL_ACCOUNTS ? undefined : accountId,
    startDate,
    endDate,
    search: search || undefined,
  });

  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.accountId, a])),
    [accounts],
  );

  const clearFilters = () => {
    setAccountId(ALL_ACCOUNTS);
    setFrom("");
    setTo("");
    setSearchInput("");
    setSearch("");
  };

  if (items !== undefined && items !== null && items.length === 0) {
    return (
      <IntegrationEmptyState
        icon={Building2}
        title={t("empty.noBankTitle")}
        description={t("empty.noBankDescription")}
      >
        <PlaidLinkButton />
      </IntegrationEmptyState>
    );
  }

  const firstPageLoading = status === "LoadingFirstPage";
  const empty = !firstPageLoading && results.length === 0;

  if (empty && !filtered) {
    return (
      <IntegrationEmptyState
        icon={Receipt}
        title={t("empty.noTransactionsTitle")}
        description={t("empty.noTransactionsDescription")}
      >
        {syncAction}
      </IntegrationEmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1.5fr)_auto_auto_auto] lg:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="transactions-search">{t("filters.search")}</Label>
          <Input
            id="transactions-search"
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={t("filters.searchPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transactions-account">{t("filters.account")}</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger id="transactions-account">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_ACCOUNTS}>
                {t("filters.allAccounts")}
              </SelectItem>
              {(accounts ?? []).map((account) => (
                <SelectItem key={account.accountId} value={account.accountId}>
                  {account.mask
                    ? `${account.name} ··${account.mask}`
                    : account.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transactions-from">{t("filters.from")}</Label>
          <Input
            id="transactions-from"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="transactions-to">{t("filters.to")}</Label>
          <Input
            id="transactions-to"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <Button
          variant="ghost"
          onClick={clearFilters}
          disabled={!filtered && !searchInput}
        >
          {t("filters.clear")}
        </Button>
      </div>

      {search && <p className="text-xs text-muted-foreground">{t("searchOrder")}</p>}

      {empty ? (
        <IntegrationEmptyState
          icon={SearchX}
          title={t("empty.noMatchesTitle")}
          description={t("empty.noMatchesDescription")}
        >
          <Button variant="outline" onClick={clearFilters}>
            {t("filters.clear")}
          </Button>
        </IntegrationEmptyState>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">{t("columns.date")}</TableHead>
                  <TableHead>{t("columns.description")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t("columns.account")}
                  </TableHead>
                  <TableHead className="text-end">
                    {t("columns.amount")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {firstPageLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-10 text-center">
                      <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : (
                  results.map((txn) => {
                    const account = accountsById.get(txn.accountId);
                    const credit =
                      transactionDirection(txn.amount) === "credit";
                    const DirectionIcon = credit ? ArrowDownLeft : ArrowUpRight;
                    return (
                      <TableRow key={txn._id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {format.dateTime(new Date(`${txn.date}T00:00:00Z`), {
                            dateStyle: "medium",
                            timeZone: "UTC",
                          })}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">
                              {txn.merchantName ?? txn.name}
                            </span>
                            {txn.pending && (
                              <Badge variant="outline">{t("pending")}</Badge>
                            )}
                          </div>
                          {txn.merchantName && txn.merchantName !== txn.name && (
                            <p className="text-xs text-muted-foreground">
                              {txn.name}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground md:hidden">
                            {account?.name}
                          </p>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground">
                          {account
                            ? account.mask
                              ? `${account.name} ··${account.mask}`
                              : account.name
                            : "—"}
                        </TableCell>
                        <TableCell
                          className={cn(
                            "whitespace-nowrap text-end font-medium tabular-nums",
                            credit && "text-emerald-600 dark:text-emerald-400",
                          )}
                        >
                          <span className="inline-flex items-center gap-1">
                            <DirectionIcon
                              className="h-3.5 w-3.5"
                              role="img"
                              aria-label={credit ? t("moneyIn") : t("moneyOut")}
                            />
                            {formatCurrency(
                              signedTransactionAmount(txn.amount),
                              transactionCurrency(txn.currency, account?.currency),
                              { showSign: true },
                            )}
                          </span>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(status === "CanLoadMore" || status === "LoadingMore") && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => loadMore(TRANSACTIONS_PAGE_SIZE)}
            disabled={status === "LoadingMore"}
          >
            {status === "LoadingMore" ? (
              <>
                <Loader2 className="me-2 h-4 w-4 animate-spin" />
                {t("loadingMore")}
              </>
            ) : (
              <>
                <ChevronDown className="me-2 h-4 w-4" />
                {t("loadMore")}
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
