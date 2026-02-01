/**
 * Cash & Money Market Category Summary Hook
 *
 * Aggregates data from all cash subcategories (bank accounts, money market, CDs, etc.)
 * to provide a unified summary for the category dashboard.
 *
 * Uses real data from Plaid bank accounts and broker cash positions via classification.
 */

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  CategorySummary,
  SubcategoryData,
  PortfolioDataPoint,
  categoryColorPalettes,
  Holding,
} from "@/lib/types/investments";
import {
  PiggyBank,
  Landmark,
  Clock,
  Banknote,
  ArrowRightLeft,
  Wallet,
  CreditCard,
} from "lucide-react";
import React from "react";

/**
 * Hook to get the cash category summary
 */
export function useCashSummary(): {
  summary: CategorySummary | null;
  isLoading: boolean;
} {
  // Fetch real cash data from Convex
  const cashData = useQuery(api.categories.getCashHoldings);

  const isLoading = cashData === undefined;

  const summary = useMemo<CategorySummary | null>(() => {
    // Return null if not authenticated or still loading
    if (cashData === undefined || cashData === null) return null;

    const {
      bankAccounts,
      brokerCash,
      brokerAccountCash,
      summary: dataSummary,
    } = cashData;
    const colors = categoryColorPalettes.cash;
    const bySubcategory = dataSummary.bySubcategory;

    // Helper to get top holdings for a subcategory
    const getTopHoldingsForSubcategory = (
      subcategory: string,
      limit: number = 3,
    ): Holding[] => {
      const holdings: Holding[] = [];

      // Add bank accounts matching this subcategory
      bankAccounts
        .filter((acc) => acc.investmentSubcategory === subcategory)
        .sort((a, b) => (b.currentBalance ?? 0) - (a.currentBalance ?? 0))
        .slice(0, limit)
        .forEach((acc) => {
          holdings.push({
            id: acc._id,
            name: acc.name || acc.officialName || "Bank Account",
            subcategoryId: subcategory,
            value: acc.currentBalance ?? 0,
            costBasis: null,
            profitLoss: null,
            profitLossPercent: null,
            allocationPercent:
              dataSummary.totalValue > 0
                ? ((acc.currentBalance ?? 0) / dataSummary.totalValue) * 100
                : 0,
            institutionName: acc.institutionName ?? undefined,
          });
        });

      // Add broker cash positions matching this subcategory
      brokerCash
        .filter((pos) => pos.investmentSubcategory === subcategory)
        .sort(
          (a, b) =>
            (b.valueInBaseCurrency ?? b.marketValue ?? 0) -
            (a.valueInBaseCurrency ?? a.marketValue ?? 0),
        )
        .slice(0, limit - holdings.length)
        .forEach((pos) => {
          const value = pos.valueInBaseCurrency ?? pos.marketValue ?? 0;
          holdings.push({
            id: pos._id,
            name: pos.symbol ?? pos.name ?? "Cash Position",
            subcategoryId: subcategory,
            value,
            costBasis: null,
            profitLoss: null,
            profitLossPercent: null,
            allocationPercent:
              dataSummary.totalValue > 0
                ? (value / dataSummary.totalValue) * 100
                : 0,
          });
        });

      // Add broker account cash for "broker-cash" subcategory
      if (subcategory === "broker-cash" && brokerAccountCash) {
        // Helper to get effective cash value (same logic as in categories.ts)
        const getEffectiveCash = (acc: (typeof brokerAccountCash)[0]) => {
          if ((acc.cash ?? 0) > 0) {
            return acc.cashValueInBaseCurrency ?? acc.cash ?? 0;
          }
          // If balance > 0 and cash is 0, the balance IS the cash
          if ((acc.balance ?? 0) > 0) {
            return acc.balance ?? 0;
          }
          return 0;
        };

        brokerAccountCash
          .sort((a, b) => getEffectiveCash(b) - getEffectiveCash(a))
          .slice(0, limit - holdings.length)
          .forEach((acc) => {
            const value = getEffectiveCash(acc);
            holdings.push({
              id: acc._id,
              name: `${acc.institutionName || acc.name} - Cash`,
              subcategoryId: subcategory,
              value,
              costBasis: null,
              profitLoss: null,
              profitLossPercent: null,
              allocationPercent:
                dataSummary.totalValue > 0
                  ? (value / dataSummary.totalValue) * 100
                  : 0,
            });
          });
      }

      return holdings.slice(0, limit);
    };

    // Build subcategories array with real data
    const subcategories: SubcategoryData[] = [];

    // 1. Checking Accounts
    const checkingData = bySubcategory["checking-accounts"] ?? {
      count: 0,
      total: 0,
    };
    subcategories.push({
      id: "checking-accounts",
      name: "Checking Accounts",
      href: "/cash/checking",
      icon: React.createElement(CreditCard, { className: "h-4 w-4" }),
      color: colors["checking-accounts"] ?? "#3B82F6",
      totalValue: checkingData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("checking-accounts"),
      holdingsCount: checkingData.count,
      implemented: true,
    });

    // 2. Savings Accounts
    const savingsData = bySubcategory["savings-accounts"] ?? {
      count: 0,
      total: 0,
    };
    subcategories.push({
      id: "savings-accounts",
      name: "Savings Accounts",
      href: "/cash/savings",
      icon: React.createElement(PiggyBank, { className: "h-4 w-4" }),
      color: colors["savings-accounts"],
      totalValue: savingsData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("savings-accounts"),
      holdingsCount: savingsData.count,
      implemented: true,
    });

    // 3. Money Market Funds
    const moneyMarketData = bySubcategory["money-market"] ?? {
      count: 0,
      total: 0,
    };
    subcategories.push({
      id: "money-market",
      name: "Money Market Funds",
      href: "/cash/money-market",
      icon: React.createElement(Landmark, { className: "h-4 w-4" }),
      color: colors["money-market"],
      totalValue: moneyMarketData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("money-market"),
      holdingsCount: moneyMarketData.count,
      implemented: true,
    });

    // 4. Certificates of Deposit
    const cdsData = bySubcategory["cds"] ?? { count: 0, total: 0 };
    subcategories.push({
      id: "cds",
      name: "Certificates of Deposit",
      href: "/cash/cds",
      icon: React.createElement(Clock, { className: "h-4 w-4" }),
      color: colors.cds,
      totalValue: cdsData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("cds"),
      holdingsCount: cdsData.count,
      implemented: true,
    });

    // 5. Treasury Bills
    const tbillsData = bySubcategory["treasury-bills"] ?? {
      count: 0,
      total: 0,
    };
    subcategories.push({
      id: "treasury-bills",
      name: "Treasury Bills",
      href: "/cash/tbills",
      icon: React.createElement(Banknote, { className: "h-4 w-4" }),
      color: colors["treasury-bills"],
      totalValue: tbillsData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("treasury-bills"),
      holdingsCount: tbillsData.count,
      implemented: true,
    });

    // 6. Broker Cash
    const brokerCashData = bySubcategory["broker-cash"] ?? {
      count: 0,
      total: 0,
    };
    subcategories.push({
      id: "broker-cash",
      name: "Broker Cash",
      href: "/cash/broker",
      icon: React.createElement(Wallet, { className: "h-4 w-4" }),
      color: colors["broker-cash"] ?? "#8B5CF6",
      totalValue: brokerCashData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("broker-cash"),
      holdingsCount: brokerCashData.count,
      implemented: true,
    });

    // 7. Foreign Currency
    const forexData = bySubcategory["forex"] ?? { count: 0, total: 0 };
    subcategories.push({
      id: "forex",
      name: "Foreign Currency",
      href: "/cash/forex",
      icon: React.createElement(ArrowRightLeft, { className: "h-4 w-4" }),
      color: "#9333EA",
      totalValue: forexData.total,
      costBasis: null,
      profitLoss: null,
      profitLossPercent: null,
      topHoldings: getTopHoldingsForSubcategory("forex"),
      holdingsCount: forexData.count,
      implemented: true,
    });

    // Calculate totals
    const totalValue = dataSummary.totalValue;
    const historyDataPoints: PortfolioDataPoint[] = [];

    return {
      totalValue,
      totalCost: null,
      profitLoss: null,
      profitLossPercent: null,
      ytdProfitLoss: null,
      ytdProfitLossPercent: null,
      valueAtYearStart: null,
      subcategories,
      historyDataPoints,
    };
  }, [cashData]);

  return {
    summary,
    isLoading,
  };
}
