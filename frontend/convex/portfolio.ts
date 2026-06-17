import { v } from "convex/values";
import { query, internalQuery } from "./_generated/server";

/**
 * Portfolio Queries
 *
 * Server-side aggregation of positions and balances across all
 * financial providers (Plaid, SnapTrade, Bitpanda).
 */

// ═══════════════════════════════════════════════════════════════
// NET WORTH QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get total net worth aggregated across all providers
 */
export const getTotalNetWorth = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    // Banking (Plaid) - Bank accounts
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Calculate Plaid totals using base currency value when available
    let plaidCash = 0;
    let plaidInvestments = 0;
    for (const account of plaidAccounts) {
      const value = account.valueInBaseCurrency ?? account.currentBalance ?? 0;
      if (
        account.type === "depository" ||
        account.type === "checking" ||
        account.type === "savings"
      ) {
        plaidCash += value;
      } else if (
        account.type === "investment" ||
        account.type === "brokerage"
      ) {
        plaidInvestments += value;
      } else if (account.type === "credit" || account.type === "loan") {
        // Liabilities are negative
        plaidCash -= Math.abs(value);
      }
    }
    const plaidTotal = plaidCash + plaidInvestments;

    // Brokers (SnapTrade) - Broker positions
    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Calculate broker totals by category
    let snaptradeEquities = 0;
    let snaptradeBonds = 0;
    let snaptradeCash = 0;
    let snaptradeOther = 0;
    for (const position of brokerPositions) {
      const value = position.valueInBaseCurrency ?? position.marketValue ?? 0;
      const category = position.investmentCategory || position.assetType;

      if (
        category === "equities" ||
        category === "equity" ||
        category === "etf" ||
        category === "stock"
      ) {
        snaptradeEquities += value;
      } else if (category === "bonds" || category === "bond") {
        snaptradeBonds += value;
      } else if (category === "cash") {
        snaptradeCash += value;
      } else {
        snaptradeOther += value;
      }
    }

    // Get broker accounts for cash balance
    const brokerAccounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const account of brokerAccounts) {
      const cashValue = account.cashValueInBaseCurrency ?? account.cash ?? 0;
      snaptradeCash += cashValue;
    }

    const snaptradeTotal =
      snaptradeEquities + snaptradeBonds + snaptradeCash + snaptradeOther;

    // Bitpanda - mixed holdings (crypto, metals, stocks, fiat)
    const bitpandaHoldings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    let bitpandaCrypto = 0;
    let bitpandaEquities = 0;
    let bitpandaCommodities = 0;
    let bitpandaCash = 0;
    let bitpandaOther = 0;
    for (const h of bitpandaHoldings) {
      const value = h.valueInBaseCurrency ?? h.marketValue ?? 0;
      switch (h.investmentCategory) {
        case "crypto":
          bitpandaCrypto += value;
          break;
        case "equities":
          bitpandaEquities += value;
          break;
        case "commodities":
          bitpandaCommodities += value;
          break;
        case "cash":
          bitpandaCash += value;
          break;
        default:
          bitpandaOther += value;
      }
    }
    const bitpandaTotal =
      bitpandaCrypto +
      bitpandaEquities +
      bitpandaCommodities +
      bitpandaCash +
      bitpandaOther;

    const bitpandaConnections = await ctx.db
      .query("bitpandaConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Get connection/account counts
    const plaidItems = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const brokerConnections = await ctx.db
      .query("brokerConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    return {
      total: plaidTotal + snaptradeTotal + bitpandaTotal,
      providers: {
        plaid: {
          total: plaidTotal,
          cash: plaidCash,
          investments: plaidInvestments,
          accountsCount: plaidAccounts.length,
          connectionsCount: plaidItems.length,
        },
        snaptrade: {
          total: snaptradeTotal,
          equities: snaptradeEquities,
          bonds: snaptradeBonds,
          cash: snaptradeCash,
          other: snaptradeOther,
          positionsCount: brokerPositions.length,
          accountsCount: brokerAccounts.length,
          connectionsCount: brokerConnections.length,
        },
        bitpanda: {
          total: bitpandaTotal,
          crypto: bitpandaCrypto,
          equities: bitpandaEquities,
          commodities: bitpandaCommodities,
          cash: bitpandaCash,
          other: bitpandaOther,
          holdingsCount: bitpandaHoldings.length,
          connectionsCount: bitpandaConnections.length,
        },
      },
      lastUpdated: Date.now(),
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// PROVIDER ALLOCATION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get allocation breakdown by provider for charts
 */
export const getProviderAllocation = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    // Get totals from each provider
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const brokerAccounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    // Calculate provider totals (using base currency where available)
    const plaidTotal = plaidAccounts.reduce((sum, a) => {
      const value = a.valueInBaseCurrency ?? a.currentBalance ?? 0;
      // Credit/loan should be negative
      if (a.type === "credit" || a.type === "loan") {
        return sum - Math.abs(value);
      }
      return sum + value;
    }, 0);

    const snaptradePositionsTotal = brokerPositions.reduce(
      (sum, p) => sum + (p.valueInBaseCurrency ?? p.marketValue ?? 0),
      0,
    );

    const snaptradeCashTotal = brokerAccounts.reduce(
      (sum, a) => sum + (a.cashValueInBaseCurrency ?? a.cash ?? 0),
      0,
    );

    const snaptradeTotal = snaptradePositionsTotal + snaptradeCashTotal;

    const bitpandaHoldings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const bitpandaTotal = bitpandaHoldings.reduce(
      (sum, h) => sum + (h.valueInBaseCurrency ?? h.marketValue ?? 0),
      0,
    );

    const totalValue = plaidTotal + snaptradeTotal + bitpandaTotal;

    // Count connections
    const plaidItems = await ctx.db
      .query("plaidItems")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const brokerConnections = await ctx.db
      .query("brokerConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const bitpandaConnections = await ctx.db
      .query("bitpandaConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const allocations = [];

    if (plaidTotal !== 0 || plaidAccounts.length > 0) {
      allocations.push({
        provider: "plaid" as const,
        name: "Banking (Plaid)",
        value: plaidTotal,
        percentage: totalValue > 0 ? (plaidTotal / totalValue) * 100 : 0,
        color: "#00D084",
        positionsCount: plaidAccounts.length,
        connectionsCount: plaidItems.length,
      });
    }

    if (snaptradeTotal !== 0 || brokerPositions.length > 0) {
      allocations.push({
        provider: "snaptrade" as const,
        name: "Brokers (SnapTrade)",
        value: snaptradeTotal,
        percentage: totalValue > 0 ? (snaptradeTotal / totalValue) * 100 : 0,
        color: "#6366F1",
        positionsCount: brokerPositions.length,
        connectionsCount: brokerConnections.length,
      });
    }

    if (bitpandaTotal !== 0 || bitpandaHoldings.length > 0) {
      allocations.push({
        provider: "bitpanda" as const,
        name: "Bitpanda",
        value: bitpandaTotal,
        percentage: totalValue > 0 ? (bitpandaTotal / totalValue) * 100 : 0,
        color: "#16BA53",
        positionsCount: bitpandaHoldings.length,
        connectionsCount: bitpandaConnections.length,
      });
    }

    return {
      allocations,
      totalValue,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// UNIFIED POSITIONS QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get all positions across all providers in a unified format
 */
export const getUnifiedPositions = query({
  args: {
    limit: v.optional(v.number()),
    provider: v.optional(
      v.union(
        v.literal("plaid"),
        v.literal("snaptrade"),
        v.literal("bitpanda"),
        v.literal("manual"),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const userId = identity.subject;
    const positions: Array<{
      id: string;
      _id: string;
      provider: "plaid" | "snaptrade" | "bitpanda" | "manual";
      category: string;
      subcategory?: string;
      symbol: string;
      name: string;
      quantity: number;
      currentPrice?: number;
      marketValue: number;
      currency: string;
      valueInBaseCurrency?: number;
      costBasis?: number;
      unrealizedPL?: number;
      unrealizedPLPercent?: number;
      lastSyncAt: number;
      metadata?: Record<string, unknown>;
    }> = [];

    // Get Plaid accounts (as positions)
    if (!args.provider || args.provider === "plaid") {
      const plaidAccounts = await ctx.db
        .query("plaidAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      // Get institution names from items
      const plaidItems = await ctx.db
        .query("plaidItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const itemMap = new Map(plaidItems.map((i) => [i.itemId, i]));

      for (const account of plaidAccounts) {
        const item = itemMap.get(account.itemId);
        const balance = account.currentBalance ?? 0;

        // Determine category based on account type
        let category: string;
        if (account.type === "credit" || account.type === "loan") {
          category = "cash"; // Liabilities shown as negative cash
        } else if (
          account.type === "investment" ||
          account.type === "brokerage"
        ) {
          category = "equities";
        } else {
          category = "cash";
        }

        positions.push({
          id: account.accountId,
          _id: account._id,
          provider: "plaid",
          category,
          subcategory: account.investmentSubcategory || account.type,
          symbol: account.type.toUpperCase(),
          name: account.name,
          quantity: 1,
          marketValue:
            account.type === "credit" || account.type === "loan"
              ? -Math.abs(balance)
              : balance,
          currency: account.currency,
          valueInBaseCurrency: account.valueInBaseCurrency,
          lastSyncAt: account.lastSynced,
          metadata: {
            accountId: account.accountId,
            institutionName: item?.institutionName,
            accountType: account.type,
            subtype: account.subtype,
            mask: account.mask,
          },
        });
      }
    }

    // Get SnapTrade positions and broker account cash
    if (!args.provider || args.provider === "snaptrade") {
      const brokerPositions = await ctx.db
        .query("brokerPositions")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      // Get broker account info for institution names and cash balances
      const brokerAccounts = await ctx.db
        .query("brokerAccounts")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      const accountMap = new Map(brokerAccounts.map((a) => [a._id, a]));

      // Add broker positions
      for (const position of brokerPositions) {
        const account = accountMap.get(position.accountId);

        // Map asset type to category
        let category: string;
        const assetType = position.assetType?.toLowerCase() || "";
        if (
          assetType === "equity" ||
          assetType === "etf" ||
          assetType === "stock"
        ) {
          category = "equities";
        } else if (assetType === "bond" || assetType === "fixed_income") {
          category = "bonds";
        } else if (assetType === "cryptocurrency") {
          category = "crypto";
        } else {
          category = position.investmentCategory || "other";
        }

        positions.push({
          id: position.snaptradePositionId || position._id,
          _id: position._id,
          provider: "snaptrade",
          category,
          subcategory: position.investmentSubcategory || position.assetType,
          symbol: position.symbol,
          name: position.name || position.symbol,
          quantity: position.quantity,
          currentPrice: position.currentPrice,
          marketValue: position.marketValue ?? 0,
          currency: position.currency,
          valueInBaseCurrency: position.valueInBaseCurrency,
          costBasis: position.totalCostBasis,
          unrealizedPL: position.unrealizedPL,
          unrealizedPLPercent: position.unrealizedPLPercent,
          lastSyncAt: position.lastSyncAt || position.createdAt,
          metadata: {
            brokerName: account?.institutionName,
            isin: position.isin,
            assetType: position.assetType,
            accountName: account?.name,
          },
        });
      }

      // Add broker account cash as separate "cash" positions
      // Check both `cash` field and `balance` field (for accounts with only cash and no positions)
      for (const account of brokerAccounts) {
        // Determine cash value: prefer explicit cash field, but for accounts with no positions
        // the balance IS the cash if there are no positions for this account
        const hasPositionsForAccount = brokerPositions.some(
          (p) => p.accountId === account._id,
        );

        let cashBalance = account.cash ?? 0;

        // If no positions exist for this account and balance > 0, the balance is cash
        if (
          !hasPositionsForAccount &&
          cashBalance === 0 &&
          (account.balance ?? 0) > 0
        ) {
          cashBalance = account.balance ?? 0;
        }

        if (cashBalance > 0) {
          positions.push({
            id: `${account._id}-cash`,
            _id: account._id,
            provider: "snaptrade",
            category: "cash",
            subcategory: "broker-cash",
            symbol: "CASH",
            name: `${account.institutionName || account.name} - Cash`,
            quantity: 1,
            marketValue: cashBalance,
            currency: account.currency,
            valueInBaseCurrency: account.cashValueInBaseCurrency ?? cashBalance,
            lastSyncAt: account.lastSyncAt || account.createdAt,
            metadata: {
              brokerName: account.institutionName,
              accountName: account.name,
              accountType: account.accountType,
            },
          });
        }
      }
    }

    // Get Bitpanda holdings
    if (!args.provider || args.provider === "bitpanda") {
      const bitpandaHoldings = await ctx.db
        .query("bitpandaHoldings")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      for (const holding of bitpandaHoldings) {
        positions.push({
          id: `${holding.connectionId}-${holding.assetType}-${holding.symbol}`,
          _id: holding._id,
          provider: "bitpanda",
          category: holding.investmentCategory || "crypto",
          subcategory: holding.investmentSubcategory || holding.assetType,
          symbol: holding.symbol,
          name: holding.name || holding.symbol,
          quantity: holding.quantity,
          currentPrice: holding.currentPrice,
          marketValue: holding.marketValue ?? 0,
          currency: holding.currency,
          valueInBaseCurrency: holding.valueInBaseCurrency,
          lastSyncAt: holding.lastSyncAt ?? holding.createdAt,
          metadata: {
            assetType: holding.assetType,
          },
        });
      }
    }

    // Get manual entries (vault items = commodities, loans = liabilities)
    if (!args.provider || args.provider === "manual") {
      // Get vault items (commodities - gold, silver, platinum, palladium)
      const vaultItems = await ctx.db
        .query("vaultItems")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();

      // Enrich with catalog data
      for (const item of vaultItems) {
        let displayName = item.customName || "Unknown Item";
        if (item.catalogItemId) {
          const catalogItem = await ctx.db.get(item.catalogItemId);
          if (catalogItem) {
            displayName = item.customName || catalogItem.name;
          }
        }

        // Calculate cost basis from purchase info
        const costBasis = item.purchasePricePerUnit
          ? item.purchasePricePerUnit * item.quantity
          : undefined;

        // Metal symbol mapping
        const metalSymbols: Record<string, string> = {
          gold: "XAU",
          silver: "XAG",
          platinum: "XPT",
          palladium: "XPD",
        };

        positions.push({
          id: item._id,
          _id: item._id,
          provider: "manual",
          category: "commodities",
          subcategory: item.metalType,
          symbol: metalSymbols[item.metalType] || item.metalType.toUpperCase(),
          name: displayName,
          quantity: item.quantity,
          marketValue: 0, // Will be calculated client-side with spot prices
          currency: item.purchaseCurrency || "EUR",
          costBasis,
          lastSyncAt: item.updatedAt,
          metadata: {
            metalType: item.metalType,
            category: item.category,
            purity: item.purity,
            weightGrams: item.weightGrams,
            fineWeightGrams: item.fineWeightGrams,
            storageLocation: item.storageLocation,
          },
        });
      }

      // Get manual loans (liabilities)
      const loans = await ctx.db
        .query("loans")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .filter((q) => q.eq(q.field("status"), "active"))
        .collect();

      for (const loan of loans) {
        positions.push({
          id: loan._id,
          _id: loan._id,
          provider: "manual",
          category: "liabilities",
          subcategory: "loans",
          symbol: "LOAN",
          name: loan.name,
          quantity: 1,
          marketValue: -Math.abs(loan.currentBalance), // Liabilities are negative
          currency: loan.currency,
          costBasis: loan.originalPrincipal,
          lastSyncAt: loan.updatedAt,
          metadata: {
            loanType: loan.loanType,
            lender: loan.lender,
            annualInterestRate: loan.annualInterestRate,
            termMonths: loan.termMonths,
            nextPaymentDate: loan.nextPaymentDate,
            scheduledPayment: loan.scheduledPayment,
          },
        });
      }
    }

    // Sort by market value (descending)
    positions.sort((a, b) => Math.abs(b.marketValue) - Math.abs(a.marketValue));

    // Apply limit if specified
    if (args.limit) {
      return positions.slice(0, args.limit);
    }

    return positions;
  },
});

// ═══════════════════════════════════════════════════════════════
// CATEGORY AGGREGATION QUERIES
// ═══════════════════════════════════════════════════════════════

/**
 * Get positions aggregated by unified category across all providers
 */
export const getCategoryBreakdown = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const userId = identity.subject;

    // Initialize category totals
    const categories: Record<
      string,
      {
        category: string;
        name: string;
        value: number;
        positionsCount: number;
        providers: Set<string>;
      }
    > = {};

    const addToCategory = (
      category: string,
      name: string,
      value: number,
      provider: string,
    ) => {
      if (!categories[category]) {
        categories[category] = {
          category,
          name,
          value: 0,
          positionsCount: 0,
          providers: new Set(),
        };
      }
      categories[category].value += value;
      categories[category].positionsCount += 1;
      categories[category].providers.add(provider);
    };

    // Process Plaid accounts
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const account of plaidAccounts) {
      const value = account.valueInBaseCurrency ?? account.currentBalance ?? 0;
      const effectiveValue =
        account.type === "credit" || account.type === "loan"
          ? -Math.abs(value)
          : value;

      if (account.type === "investment" || account.type === "brokerage") {
        addToCategory("equities", "Equities", effectiveValue, "plaid");
      } else {
        addToCategory("cash", "Cash & Savings", effectiveValue, "plaid");
      }
    }

    // Process SnapTrade positions
    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const position of brokerPositions) {
      const value = position.valueInBaseCurrency ?? position.marketValue ?? 0;
      const assetType = position.assetType?.toLowerCase() || "";

      if (
        assetType === "equity" ||
        assetType === "etf" ||
        assetType === "stock"
      ) {
        addToCategory("equities", "Equities", value, "snaptrade");
      } else if (assetType === "bond" || assetType === "fixed_income") {
        addToCategory("bonds", "Bonds", value, "snaptrade");
      } else if (assetType === "cryptocurrency") {
        addToCategory("crypto", "Cryptocurrency", value, "snaptrade");
      } else {
        addToCategory("other", "Other", value, "snaptrade");
      }
    }

    // Add broker cash
    const brokerAccounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const account of brokerAccounts) {
      const cashValue = account.cashValueInBaseCurrency ?? account.cash ?? 0;
      if (cashValue > 0) {
        addToCategory("cash", "Cash & Savings", cashValue, "snaptrade");
      }
    }

    // Process Bitpanda holdings
    const bitpandaHoldings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    for (const holding of bitpandaHoldings) {
      const value = holding.valueInBaseCurrency ?? holding.marketValue ?? 0;
      const category = holding.investmentCategory ?? "crypto";
      const label =
        category === "crypto"
          ? "Cryptocurrency"
          : category.charAt(0).toUpperCase() + category.slice(1);
      addToCategory(category, label, value, "bitpanda");
    }

    // Calculate total and percentages
    const totalValue = Object.values(categories).reduce(
      (sum, c) => sum + c.value,
      0,
    );

    const result = Object.values(categories)
      .map((c) => ({
        category: c.category,
        name: c.name,
        value: c.value,
        percentage: totalValue > 0 ? (c.value / totalValue) * 100 : 0,
        positionsCount: c.positionsCount,
        providers: Array.from(c.providers),
      }))
      .sort((a, b) => b.value - a.value);

    return {
      categories: result,
      totalValue,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// INTERNAL QUERIES (for cron jobs and actions)
// ═══════════════════════════════════════════════════════════════

/**
 * Internal query to get net worth for a specific user (for cron/actions)
 */
export const getNetWorthForUser = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const userId = args.userId;

    // Plaid
    const plaidAccounts = await ctx.db
      .query("plaidAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const plaidTotal = plaidAccounts.reduce((sum, a) => {
      const value = a.valueInBaseCurrency ?? a.currentBalance ?? 0;
      if (a.type === "credit" || a.type === "loan") {
        return sum - Math.abs(value);
      }
      return sum + value;
    }, 0);

    // SnapTrade
    const brokerPositions = await ctx.db
      .query("brokerPositions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const brokerAccounts = await ctx.db
      .query("brokerAccounts")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const snaptradeTotal =
      brokerPositions.reduce(
        (sum, p) => sum + (p.valueInBaseCurrency ?? p.marketValue ?? 0),
        0,
      ) +
      brokerAccounts.reduce(
        (sum, a) => sum + (a.cashValueInBaseCurrency ?? a.cash ?? 0),
        0,
      );

    // Bitpanda
    const bitpandaHoldings = await ctx.db
      .query("bitpandaHoldings")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();

    const bitpandaTotal = bitpandaHoldings.reduce(
      (sum, h) => sum + (h.valueInBaseCurrency ?? h.marketValue ?? 0),
      0,
    );

    return {
      plaid: plaidTotal,
      snaptrade: snaptradeTotal,
      bitpanda: bitpandaTotal,
      total: plaidTotal + snaptradeTotal + bitpandaTotal,
    };
  },
});
