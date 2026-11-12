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
import type { ToBaseAmount } from "../../../services/finance/metalsLedger";
import {
  averageCostPerUnit,
  bankAccountValue,
  type AverageCost,
  bitpandaCostBasis,
  brokerAccountCash,
  brokerAccountMarginDebt,
  loanBalanceInBase,
  loanCountsAsLiability,
  loanMonthlyPaymentInBase,
  positionCostBasis,
  positionValue,
} from "../../../services/portfolio/categorySummary";
import {
  aggregateNetWorth,
  buildSnapshotBreakdown,
  positionOwed,
  toHoldingCategory,
  type NormalizedHolding,
  type SnapshotCategoryEntry,
} from "../../../services/portfolio/aggregate";
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
 * - Each holding carries a key that survives provider re-syncs, and a
 *   foreign-currency position its native cost, for the snapshot flows
 *   (aggregate.ts holdingNetFlow). A holding traded since the previous
 *   snapshot takes its exact flow from the trade logs instead
 *   (loadExactFlows).
 * - Loans count when active or defaulted (D1).
 */

type BankAccountDoc = Doc<"plaidAccounts">;
type BrokerPositionDoc = Doc<"brokerPositions">;
type BrokerAccountDoc = Doc<"brokerAccounts">;
/** A Bitpanda holding with its cost basis derived from the synced trades */
type BitpandaHoldingDoc = Doc<"bitpandaHoldings"> & {
  costBasisInBaseCurrency?: number;
};

/** A holding together with the stored document it was read from. */
export type LoadedHolding =
  | (NormalizedHolding & { source: "bank"; doc: BankAccountDoc })
  | (NormalizedHolding & { source: "brokerPosition"; doc: BrokerPositionDoc })
  | (NormalizedHolding & { source: "brokerAccount"; doc: BrokerAccountDoc })
  | (NormalizedHolding & { source: "bitpanda"; doc: BitpandaHoldingDoc })
  | (NormalizedHolding & { source: "vault"; doc: Doc<"vaultItems"> })
  | (NormalizedHolding & { source: "loan"; doc: Doc<"loans"> });

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
  for (const raw of brokerPositions) {
    const doc = positionWithBaseFields(raw, rates);
    const category = toHoldingCategory(doc.investmentCategory);
    const value = positionValue(doc);
    const costBase = positionCostBasis(doc);
    holdings.push({
      id: doc._id,
      key: brokerPositionKey(doc.accountId, doc.symbol),
      provider: "snaptrade",
      source: "brokerPosition",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: category === "liabilities" ? positionOwed(value) : value,
      costBase,
      ...(costBase !== null &&
      doc.totalCostBasis !== undefined &&
      doc.currency !== BASE_CURRENCY
        ? { costNative: { amount: doc.totalCostBasis, currency: doc.currency } }
        : {}),
      pricedAt: doc.lastSyncAt ?? doc.createdAt,
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
  const averageCost =
    bitpandaHoldings.length > 0
      ? averageCostPerUnit(
          await ctx.db
            .query("bitpandaTransactions")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .collect(),
          toBaseAmount,
        )
      : new Map<string, AverageCost>();
  for (const raw of bitpandaHoldings) {
    const category = toHoldingCategory(raw.investmentCategory);
    const value = positionValue(raw);
    const cost =
      category === "liabilities" ? undefined : bitpandaCostBasis(raw, averageCost);
    const doc: BitpandaHoldingDoc =
      cost === undefined ? raw : { ...raw, costBasisInBaseCurrency: cost.base };
    holdings.push({
      id: doc._id,
      key: bitpandaHoldingKey(doc.connectionId, doc.assetType, doc.symbol),
      provider: "bitpanda",
      source: "bitpanda",
      category,
      subcategory: doc.investmentSubcategory ?? "unknown",
      name: doc.symbol ?? doc.name ?? "Unknown",
      valueBase: category === "liabilities" ? positionOwed(value) : value,
      costBase: cost?.base ?? null,
      // A foreign-currency cost stays put when the rate moves, so the
      // snapshot flow is read from it (holdingNetFlow)
      ...(cost?.native ? { costNative: cost.native } : {}),
      // When the price was taken, so a stale price (kept from an earlier
      // sync, holdingPrice.ts) pulls asOf back; null when never priced.
      // Rows synced before priceStatus fall back to their sync time.
      pricedAt:
        doc.priceStatus === "missing"
          ? null
          : (doc.priceAsOf ?? doc.lastSyncAt ?? doc.createdAt),
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
      const { value, cost } = vaultItemValuation(
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

  return holdings;
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

  // One rate table per trade day, for the currencies traded that day
  const dayOf = (date: string) => {
    const t = Date.parse(date);
    return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
  };
  const currenciesByDay = new Map<string, Set<string>>();
  for (const { date, currency } of [
    ...bitpanda.map((t) => ({ date: t.transactionDate, currency: t.currency })),
    ...broker.map((t) => ({ date: t.tradeDate, currency: t.currency })),
  ]) {
    const day = dayOf(date);
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
  const toBaseOn: ToBaseOn = (amount, currency, date) => {
    const day = dayOf(date);
    const converted = toBase(
      amount,
      currency,
      (day && ratesByDay.get(day)) || {},
    );
    return converted.ok ? converted.value : null;
  };

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
  };
}
