import { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { loadFxRates } from "../fxRates";
import {
  BASE_CURRENCY,
  bankAccountWithBaseFields,
  brokerAccountWithBaseFields,
  normalizeCurrency,
  positionWithBaseFields,
  toBase,
  type FxRates,
} from "../../../services/finance/currency";
import { vaultItemValuation } from "../../../services/finance/metals";
import { manualAssetInBase } from "../../../services/portfolio/manualAssets";
import type { ToBaseAmount } from "../../../services/finance/metalsLedger";
import {
  averageCostPerUnit,
  bankAccountValue,
  type AverageCost,
  bitpandaCostBasis,
  bitpandaValuation,
  brokerAccountCash,
  brokerAccountMarginDebt,
  loanBalanceInBase,
  loanCountsAsLiability,
  loanMonthlyPaymentInBase,
  positionCostBasis,
  positionValue,
  tradeDay,
} from "../../../services/portfolio/categorySummary";
import { tradeDateCostBasis } from "../../../services/portfolio/tradeDateCost";
import {
  aggregateNetWorth,
  buildSnapshotBreakdown,
  positionOwed,
  toHoldingCategory,
  type NormalizedHolding,
  type SnapshotCategoryEntry,
} from "../../../services/portfolio/aggregate";
import {
  canOverrideValuation,
  overriddenValue,
  type OverriddenValue,
  type ValuationOverride,
} from "../../../services/pricing/valuationOverride";
import {
  bitpandaHoldingKey,
  bitpandaTradeFlow,
  bitpandaTradeKeys,
  brokerPositionKey,
  snaptradeActivityFlow,
  tradeFlowsBetween,
  vaultLedgerFlows,
  type ToBaseOn,
  type TradeFlow,
} from "../../../services/portfolio/flows";

/**
 * The one loader behind every net-worth figure: it reads each provider table
 * once and maps every row to a NormalizedHolding, which
 * services/portfolio/aggregate.ts groups and totals. computeNetWorth
 * (snapshots, GET /api/v1/net-worth), portfolio.getOverview (dashboard,
 * liabilities, retirement), portfolio.getUnifiedPositions and the
 * categories.* queries all read through it, so they always agree.
 *
 * - Values are in the base currency (EUR): provider documents are read only
 *   through their *InBaseCurrency fields, stamped at sync time from the
 *   fxRates mirror (rows stored before that are stamped here), and manual
 *   loans are converted by their currency. An amount without a rate counts
 *   0, never 1:1 as EUR.
 * - The category is the stored investmentCategory, which already reflects
 *   user overrides; a missing one is "unclassified".
 * - A liability's value is the amount owed (positive = owed): a Plaid
 *   credit/loan balance as reported, a provider position's absolute value
 *   (positionOwed), a broker account's margin debit, a loan's balance.
 * - Vault items are valued at live spot (metalSpotPrices) with the shared
 *   metals valuation (vaultItemValuation), falling back to cost when no
 *   fresh spot price exists. An item with neither counts 0 (M-C6: its value
 *   is unknown); the cost fallback stays so that a price outage does not
 *   drop the vault from net worth and the snapshots.
 * - A Bitpanda holding's cost basis is the average cost of its symbol from
 *   the synced trades (rewards at no cost) times the quantity held, and
 *   none when more is held than the trades account for (categorySummary.ts
 *   averageCostPerUnit, bitpandaCostBasis); Bitpanda reports none itself.
 * - Costs are in EUR at the rates of their trade dates (loadToBaseOn): a
 *   Bitpanda buy at its day's rate, a foreign-currency broker position's
 *   cost at the rates of the account's trades in it (tradeDateCost.ts),
 *   falling back to today's rate, flagged costFxEstimated, when its trades
 *   do not explain it. Vault rows carry their trade-date EUR price.
 * - Each holding carries a key that survives provider re-syncs, and a
 *   foreign-currency position its native cost, for the snapshot flows
 *   (aggregate.ts holdingNetFlow). A holding traded since the previous
 *   snapshot takes its exact flow from the trade logs instead
 *   (loadExactFlows).
 * - Loans count when active or defaulted (D1).
 * - Manual assets are worth their latest valuation, converted from their
 *   currency at today's rates (services/portfolio/manualAssets.ts); they
 *   are valued discretely, from their own valuations, with no price feed.
 * - A broker position or Bitpanda holding with a per-asset valuation
 *   override (valuationOverrides, ENG-239) is worth its synced quantity at
 *   the override's price, converted at today's rate
 *   (services/pricing/valuationOverride.ts); its cost basis is unchanged.
 *   The override is matched by the holding's sync-stable key and ignored
 *   on cash and liabilities.
 */

type BankAccountDoc = Doc<"plaidAccounts">;
/**
 * A broker position with its EUR cost at trade-date rates (and the P/L
 * from it); costFxEstimated: at today's rate, the trade dates unknown
 */
type BrokerPositionDoc = Doc<"brokerPositions"> & { costFxEstimated?: boolean };
type BrokerAccountDoc = Doc<"brokerAccounts">;
/** A Bitpanda holding with its cost basis derived from the synced trades */
type BitpandaHoldingDoc = Doc<"bitpandaHoldings"> & {
  costBasisInBaseCurrency?: number;
};

/** A holding's value under its per-asset override, with the override as entered. */
export type HoldingOverride = OverriddenValue & {
  kind: ValuationOverride["kind"];
  input: ValuationOverride;
};

/** A holding together with the stored document it was read from. */
export type LoadedHolding =
  | (NormalizedHolding & { source: "bank"; doc: BankAccountDoc })
  | (NormalizedHolding & {
      source: "brokerPosition";
      doc: BrokerPositionDoc;
      override?: HoldingOverride;
    })
  | (NormalizedHolding & { source: "brokerAccount"; doc: BrokerAccountDoc })
  | (NormalizedHolding & {
      source: "bitpanda";
      doc: BitpandaHoldingDoc;
      override?: HoldingOverride;
    })
  | (NormalizedHolding & { source: "vault"; doc: Doc<"vaultItems"> })
  | (NormalizedHolding & { source: "loan"; doc: Doc<"loans"> })
  | (NormalizedHolding & { source: "manualAsset"; doc: Doc<"manualAssets"> });

/** The spot-price mirror (metalPrices.ts), by metal. */
export async function loadSpotPrices(
  ctx: QueryCtx,
): Promise<Map<string, Doc<"metalSpotPrices">>> {
  return new Map(
    (await ctx.db.query("metalSpotPrices").collect()).map((p) => [
      p.metalType,
      p,
    ]),
  );
}

export async function loadHoldings(
  ctx: QueryCtx,
  userId: string,
): Promise<LoadedHolding[]> {
  const rates = await loadFxRates(ctx);
  const toBaseAmount: ToBaseAmount = (amount, currency) => {
    const converted = toBase(amount, currency, rates);
    return converted.ok ? converted.value : null;
  };
  const now = Date.now();
  const holdings: LoadedHolding[] = [];
  /** Today's rate when a trade's date has no readable day */
  const toBaseOnOrToday =
    (toBaseOn: ToBaseOn): ToBaseOn =>
    (amount, currency, date) =>
      toBaseOn(amount, currency, date) ?? toBaseAmount(amount, currency);

  // Per-asset valuation overrides, by holding key (ENG-239)
  const overrides = new Map(
    (
      await ctx.db
        .query("valuationOverrides")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect()
    ).map((o) => [o.holdingKey, o]),
  );
  /** The override's value of a holding, when it has one that applies. */
  const overrideFor = (
    key: string,
    category: string,
    quantity: number,
  ): HoldingOverride | undefined => {
    const override = overrides.get(key);
    if (!override || !canOverrideValuation(category)) return undefined;
    const input: ValuationOverride = {
      kind: override.kind,
      pricePerUnit: override.pricePerUnit,
      currency: override.currency,
      asOf: override.asOf,
      ...(override.annualRatePercent !== undefined
        ? { annualRatePercent: override.annualRatePercent }
        : {}),
    };
    return {
      kind: override.kind,
      input,
      ...overriddenValue(quantity, input, now, toBaseAmount),
    };
  };

  // 1. Bank accounts (Plaid)
  const bankAccounts = await ctx.db
    .query("plaidAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const raw of bankAccounts) {
    const doc = bankAccountWithBaseFields(raw, rates);
    const category = toHoldingCategory(doc.investmentCategory);
    holdings.push({
      id: doc._id,
      key: `bank:${doc.accountId}`,
      provider: "plaid",
      source: "bank",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.name || doc.officialName || "Account",
      // Plaid reports a credit/loan balance as the amount owed
      valueBase: bankAccountValue(doc),
      costBase: null,
      pricedAt: doc.lastSynced,
      doc,
    });
  }

  // 2. Broker positions and account cash (SnapTrade)
  const brokerPositions = await ctx.db
    .query("brokerPositions")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  const tradeDateCost = await loadTradeDateCosts(ctx, brokerPositions);
  for (const raw of brokerPositions) {
    const doc = tradeDateCost(positionWithBaseFields(raw, rates));
    const category = toHoldingCategory(doc.investmentCategory);
    const value = positionValue(doc);
    const costBase = positionCostBasis(doc);
    const key = brokerPositionKey(doc.accountId, doc.symbol);
    const override = overrideFor(key, category, doc.quantity);
    holdings.push({
      id: doc._id,
      key,
      provider: "snaptrade",
      source: "brokerPosition",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: override
        ? (override.valueBase ?? 0)
        : category === "liabilities"
          ? positionOwed(value)
          : value,
      costBase,
      ...(costBase !== null &&
      doc.totalCostBasis !== undefined &&
      doc.currency !== BASE_CURRENCY
        ? { costNative: { amount: doc.totalCostBasis, currency: doc.currency } }
        : {}),
      // An override is the user's own record, like a manual asset
      pricedAt: override ? null : (doc.lastSyncAt ?? doc.createdAt),
      ...(override ? { override } : {}),
      doc,
    });
  }

  const brokerAccounts = await ctx.db
    .query("brokerAccounts")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const raw of brokerAccounts) {
    const doc = brokerAccountWithBaseFields(raw, rates);
    const cash = brokerAccountCash(doc);
    const marginDebt = brokerAccountMarginDebt(doc);
    if (cash <= 0 && marginDebt <= 0) continue;
    const isDebit = marginDebt > 0;
    holdings.push({
      id: doc._id,
      provider: "snaptrade",
      source: "brokerAccount",
      category: isDebit ? "liabilities" : "cash",
      subcategory: isDebit ? "margin-loans" : "broker-cash",
      name: `${doc.institutionName || doc.name} - ${isDebit ? "Margin" : "Cash"}`,
      valueBase: isDebit ? marginDebt : cash,
      costBase: null,
      pricedAt: doc.lastSyncAt ?? doc.createdAt,
      doc,
    });
  }

  // 3. Bitpanda holdings (crypto, metals, stocks, fiat; values in EUR)
  const bitpandaHoldings = await ctx.db
    .query("bitpandaHoldings")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  let averageCost = new Map<string, AverageCost>();
  if (bitpandaHoldings.length > 0) {
    const trades = await ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    const toBaseOn = await loadToBaseOn(
      ctx,
      trades
        .filter((t) => t.type === "buy")
        .map((t) => ({ date: t.transactionDate, currency: t.currency })),
    );
    averageCost = averageCostPerUnit(trades, toBaseOnOrToday(toBaseOn));
  }
  for (const raw of bitpandaHoldings) {
    const category = toHoldingCategory(raw.investmentCategory);
    const cost =
      category === "liabilities" ? undefined : bitpandaCostBasis(raw, averageCost);
    const { value, valuedAtCost } = bitpandaValuation(raw, cost);
    // Valued at cost: the row shows that value and no cost, so no P/L
    const doc: BitpandaHoldingDoc =
      cost === undefined
        ? raw
        : valuedAtCost
          ? { ...raw, valueInBaseCurrency: value }
          : { ...raw, costBasisInBaseCurrency: cost.base };
    const key = bitpandaHoldingKey(doc.connectionId, doc.assetType, doc.symbol);
    const override =
      doc.assetType === "fiat"
        ? undefined
        : overrideFor(key, category, doc.quantity);
    holdings.push({
      id: doc._id,
      key,
      provider: "bitpanda",
      source: "bitpanda",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: override
        ? (override.valueBase ?? 0)
        : category === "liabilities"
          ? positionOwed(value)
          : value,
      costBase: cost?.base ?? null,
      // A foreign-currency cost stays put when the rate moves, so the
      // snapshot flow is read from it (holdingNetFlow)
      ...(cost?.native ? { costNative: cost.native } : {}),
      // Never priced, counted at cost: its P/L is unknown (profitLossCostBase)
      ...(valuedAtCost && !override ? { valuedAtCost: true } : {}),
      // When the price was taken, so a stale price (kept from an earlier
      // sync, holdingPrice.ts) pulls asOf back; null when never priced.
      // Rows synced before priceStatus fall back to their sync time.
      pricedAt:
        override || doc.priceStatus === "missing"
          ? null
          : (doc.priceAsOf ?? doc.lastSyncAt ?? doc.createdAt),
      ...(override ? { override } : {}),
      doc,
    });
  }

  // 4. Vault items (manual precious metals), valued at live spot
  const vaultItems = await ctx.db
    .query("vaultItems")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  if (vaultItems.length > 0) {
    const spotByMetal = await loadSpotPrices(ctx);
    for (const doc of vaultItems) {
      const spot = spotByMetal.get(doc.metalType);
      // The cached quantity and cost (rewritten from the ledger on every
      // change, vault.ts syncProjection)
      const { value, cost, pricedAtSpot } = vaultItemValuation(
        doc,
        undefined,
        spot,
        now,
        toBaseAmount,
      );
      holdings.push({
        id: doc._id,
        provider: "manual",
        source: "vault",
        category: "commodities",
        subcategory: "metals",
        name: doc.customName ?? doc.metalType,
        valueBase: value ?? 0,
        costBase: cost,
        // Valued at cost without a fresh spot: its P/L is unknown, not
        // break-even (aggregate.ts profitLossCostBase)
        ...(!pricedAtSpot && value !== null ? { valuedAtCost: true } : {}),
        // The spot row's timestamp even when it is stale and the item fell
        // back to cost, so a stale price pulls asOf back; null only without
        // any spot row
        pricedAt: spot ? spot.sourceTimestamp : null,
        doc,
      });
    }
  }

  // 5. Manual loans that count as liabilities (active, defaulted)
  const loans = await ctx.db
    .query("loans")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const doc of loans) {
    if (!loanCountsAsLiability(doc.status)) continue;
    holdings.push({
      id: doc._id,
      provider: "manual",
      source: "loan",
      category: "liabilities",
      subcategory: "loans",
      name: doc.name,
      valueBase: loanBalanceInBase(doc, rates),
      costBase: null,
      pricedAt: null,
      monthlyPaymentBase: loanMonthlyPaymentInBase(doc, rates),
      doc,
    });
  }

  // 6. Manual assets (property, vehicles, private equity, collectibles)
  const manualAssets = await ctx.db
    .query("manualAssets")
    .withIndex("by_user", (q) => q.eq("userId", userId))
    .collect();
  for (const doc of manualAssets) {
    const { valueBase, costBase, costNative } = manualAssetInBase(
      doc,
      toBaseAmount,
    );
    holdings.push({
      id: doc._id,
      provider: "manual",
      source: "manualAsset",
      category: toHoldingCategory(doc.category),
      subcategory: doc.subcategory,
      name: doc.name,
      valueBase,
      costBase,
      ...(costNative ? { costNative } : {}),
      pricedAt: null,
      doc,
    });
  }

  return holdings;
}

/**
 * Conversion at the rate of a trade's date for the dated amounts given:
 * one rate table per UTC day (tradeDay), for the currencies of that day,
 * each the nearest earlier mirrored rate (loadFxRates `asOf`; a day before
 * the mirror's history takes its earliest rate). A date or currency not
 * among `dated` converts only from EUR; null otherwise.
 */
async function loadToBaseOn(
  ctx: QueryCtx,
  dated: readonly { date: string; currency: string }[],
): Promise<ToBaseOn> {
  const currenciesByDay = new Map<string, Set<string>>();
  for (const { date, currency } of dated) {
    const day = tradeDay(date);
    const code = normalizeCurrency(currency)?.code;
    if (!day || !code || code === BASE_CURRENCY) continue;
    currenciesByDay.set(day, (currenciesByDay.get(day) ?? new Set()).add(code));
  }
  const ratesByDay = new Map<string, FxRates>(
    await Promise.all(
      [...currenciesByDay].map(
        async ([day, codes]) =>
          [day, await loadFxRates(ctx, { asOf: day, currencies: [...codes] })] as const,
      ),
    ),
  );
  return (amount, currency, date) => {
    const day = tradeDay(date);
    const converted = toBase(
      amount,
      currency,
      (day && ratesByDay.get(day)) || {},
    );
    return converted.ok ? converted.value : null;
  };
}

/**
 * The EUR cost of each foreign-currency broker position at the rates of
 * its trade dates (services/portfolio/tradeDateCost.ts), from the synced
 * activities of its account, with the P/L from it. A position whose trades
 * do not explain it keeps its cost at today's rate, flagged
 * costFxEstimated. Reads the activities only of accounts that hold such a
 * position.
 */
async function loadTradeDateCosts(
  ctx: QueryCtx,
  positions: readonly Doc<"brokerPositions">[],
): Promise<(doc: Doc<"brokerPositions">) => BrokerPositionDoc> {
  const costed = (p: Doc<"brokerPositions">) =>
    p.totalCostBasis !== undefined &&
    normalizeCurrency(p.currency)?.code !== BASE_CURRENCY;
  const accountIds = [
    ...new Set(positions.filter(costed).map((p) => p.accountId)),
  ];
  if (accountIds.length === 0) return (doc) => doc;
  const trades = (
    await Promise.all(
      accountIds.map((accountId) =>
        ctx.db
          .query("brokerTransactions")
          .withIndex("by_account", (q) => q.eq("accountId", accountId))
          .collect(),
      ),
    )
  ).flat();
  const bySymbol = new Map<string, Doc<"brokerTransactions">[]>();
  for (const t of trades) {
    const key = `${t.accountId}:${t.symbol}`;
    const group = bySymbol.get(key);
    if (group) group.push(t);
    else bySymbol.set(key, [t]);
  }
  const toBaseOn = await loadToBaseOn(
    ctx,
    trades
      .filter((t) => t.type.toUpperCase() === "BUY")
      .map((t) => ({ date: t.tradeDate, currency: t.currency })),
  );
  return (doc) => {
    if (!costed(doc) || doc.costBasisInBaseCurrency === undefined) return doc;
    const cost = tradeDateCostBasis(
      {
        quantity: doc.quantity,
        totalCostBasis: doc.totalCostBasis!,
        currency: doc.currency,
      },
      bySymbol.get(`${doc.accountId}:${doc.symbol}`) ?? [],
      toBaseOn,
      doc.costBasisInBaseCurrency,
      BASE_CURRENCY,
    );
    return {
      ...doc,
      costBasisInBaseCurrency: cost.base,
      unrealizedPLInBaseCurrency:
        doc.valueInBaseCurrency !== undefined
          ? doc.valueInBaseCurrency - cost.base
          : undefined,
      ...(cost.estimated ? { costFxEstimated: true } : {}),
    };
  };
}

/**
 * Exact flow per holding key since the previous snapshot (`from`, ms) from
 * the trade logs: Bitpanda transactions, the vault ledger and the synced
 * SnapTrade activities (brokerTransactions), each amount at the rate of
 * its own date (services/portfolio/flows.ts). Provider rows are read from
 * the day of `from`, the vault ledger whole; tradeFlowsBetween keeps the
 * ones after `from`.
 */
async function loadExactFlows(
  ctx: QueryCtx,
  userId: string,
  holdings: readonly NormalizedHolding[],
  previous: readonly SnapshotCategoryEntry[],
  from: number,
  to: number,
): Promise<Map<string, number>> {
  const since = new Date(from).toISOString().slice(0, 10);
  const [bitpanda, vault, broker] = await Promise.all([
    ctx.db
      .query("bitpandaTransactions")
      .withIndex("by_date", (q) =>
        q.eq("userId", userId).gte("transactionDate", since),
      )
      .collect(),
    // The whole ledger: a row written since `from` may be dated before it
    // (vaultLedgerFlows). A vault is small.
    ctx.db
      .query("vaultTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
    ctx.db
      .query("brokerTransactions")
      .withIndex("by_date", (q) => q.eq("userId", userId).gte("tradeDate", since))
      .collect(),
  ]);

  const toBaseOn = await loadToBaseOn(ctx, [
    ...bitpanda.map((t) => ({ date: t.transactionDate, currency: t.currency })),
    ...broker.map((t) => ({ date: t.tradeDate, currency: t.currency })),
  ]);

  const bitpandaKeys = bitpandaTradeKeys([
    ...holdings.map((h) => h.key ?? h.id),
    ...previous.flatMap((e) =>
      (e.sources ?? []).flatMap((s) => (s.holdings ?? []).map((h) => h.key)),
    ),
  ]);
  const flows = [
    ...bitpanda.map((t) => bitpandaTradeFlow(t, bitpandaKeys, toBaseOn)),
    ...vaultLedgerFlows(vault, from, to),
    ...broker.map((t) => snaptradeActivityFlow(t, toBaseOn)),
  ].filter((f): f is TradeFlow => f !== null);
  return tradeFlowsBetween(flows, from, to);
}

/**
 * Server-side net worth for one user: the aggregate of loadHoldings plus
 * the snapshot's category breakdown and cost totals. With the previous
 * snapshot (its breakdown and when it was taken), each entry also records
 * its net flow since then: exact for the holdings traded in between,
 * derived from values and costs for the rest.
 * `asOf` is the data's freshness (the oldest pricedAt), not the call time.
 */
export async function computeNetWorth(
  ctx: QueryCtx,
  userId: string,
  previous?: {
    categoryBreakdown?: readonly SnapshotCategoryEntry[];
    timestamp: number;
  },
) {
  const holdings = await loadHoldings(ctx, userId);
  const aggregate = aggregateNetWorth(holdings);
  const previousBreakdown = previous?.categoryBreakdown;
  const exactFlows = previousBreakdown
    ? await loadExactFlows(
        ctx,
        userId,
        holdings,
        previousBreakdown,
        previous.timestamp,
        Date.now(),
      )
    : undefined;
  const { categoryBreakdown, totalCostBasis, totalCoveredValue } =
    buildSnapshotBreakdown(aggregate, holdings, previousBreakdown, exactFlows);

  return {
    totalAssets: aggregate.totalAssets,
    totalLiabilities: aggregate.totalLiabilities,
    netWorth: aggregate.netWorth,
    totalCostBasis,
    totalCoveredValue,
    categoryBreakdown,
    asOf: aggregate.asOf,
    // Every category with its subcategories and sources, for the public API
    byCategory: aggregate.byCategory,
  };
}
