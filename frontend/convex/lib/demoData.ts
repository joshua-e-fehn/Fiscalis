import type { WithoutSystemFields } from "convex/server";
import type { Doc, Id, TableNames } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import {
  classifyBitpandaPosition,
  classifyPlaidAccount,
  classifySnaptradePosition,
  getClassificationFields,
} from "../../../services/classification";
import {
  DEFAULT_CONSERVATIVE_RETURN,
  DEFAULT_INFLATION_RATE,
  DEFAULT_OPTIMISTIC_RETURN,
  DEFAULT_WITHDRAWAL_RATE,
} from "../../../services/finance/retirementService";
import {
  bankAccountBaseFields,
  brokerAccountBaseFields,
  positionBaseFields,
} from "../../../services/finance/currency";
import { loadFxRates } from "../fxRates";
import { brokerPositionKey } from "../../../services/portfolio/flows";

/**
 * A complete, plausible dataset for one user: a row in every user-owned
 * table. seed.ts seedDemoUser writes it for the dev demo user, and the
 * convex-test suites (convex/tests/) use it as the data another user must
 * not reach.
 *
 * Provider rows carry placeholder secrets (`demo:` prefix, not encrypted),
 * so a provider refresh for this user fails instead of calling the
 * provider; the Bitpanda connection is "disconnected" so the 6-hourly cron
 * skips it, and nothing registers the user in syncTargets, so the daily
 * sync skips it too.
 */

/** The Clerk subject seedDemoUser writes for when no userId is given. */
export const DEMO_USER_ID = "user_demo";

/** Placeholder for a provider secret: never decrypts, never reaches a provider. */
const PLACEHOLDER_SECRET = "demo:not-a-real-secret";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Every document the dataset wrote, by table. */
export type DemoIds = { [T in TableNames]?: Id<T>[] };

/** Tables the dataset writes rows to (all of them carry `userId`). */
export const DEMO_TABLES = [
  "userSettings",
  "onboardingProgress",
  "plaidItems",
  "plaidAccounts",
  "plaidTransactions",
  "snaptradeUsers",
  "brokerConnections",
  "brokerAccounts",
  "brokerPositions",
  "brokerTransactions",
  "bitpandaConnections",
  "bitpandaHoldings",
  "bitpandaTransactions",
  "loans",
  "loanPayments",
  "loanScenarios",
  "retirementPlans",
  "manualAssets",
  "pies",
  "goalTrackers",
  "goalEntries",
  "goals",
  "vaultItems",
  "vaultTransactions",
  "worldBankFavorites",
  "portfolioSnapshots",
  "apiKeys",
  "valuationOverrides",
] as const satisfies readonly TableNames[];

type DemoTable = (typeof DEMO_TABLES)[number];

/** Writes the dataset for `userId`. Not idempotent on its own; see seed.ts. */
export async function insertDemoData(
  ctx: MutationCtx,
  userId: string,
  now: number = Date.now(),
): Promise<DemoIds> {
  const ids: DemoIds = {};
  const insert = async <T extends DemoTable>(
    table: T,
    doc: WithoutSystemFields<Doc<T>>,
  ): Promise<Id<T>> => {
    const id = await ctx.db.insert(table, doc);
    ((ids[table] ??= []) as Id<T>[]).push(id);
    return id;
  };
  const rates = await loadFxRates(ctx);
  // Item and account ids are unique per user, like the providers' own
  const tag = userId.replace(/[^A-Za-z0-9]/g, "").slice(-12);

  await insert("userSettings", {
    userId,
    displayName: "Demo",
    birthDate: "1988-04-12",
    defaultCurrency: "EUR",
    language: "en",
    theme: "system",
    createdAt: now,
    updatedAt: now,
  });
  await insert("onboardingProgress", {
    userId,
    currentStep: 6,
    completedSteps: [1, 2, 3, 4, 5, 6],
    skippedSteps: [],
    profileCompleted: true,
    bankingConnected: true,
    brokersConnected: true,
    cryptoConnected: true,
    onboardingCompleted: true,
    completedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  // ── Banking (Plaid) ────────────────────────────────────────────
  const itemId = `demo-item-${tag}`;
  await insert("plaidItems", {
    userId,
    accessToken: PLACEHOLDER_SECRET,
    itemId,
    institutionId: "ins_demo",
    institutionName: "Demo Bank",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  const bankAccounts = [
    { key: "checking", name: "Girokonto", type: "depository", subtype: "checking", balance: 3250.4 },
    { key: "savings", name: "Tagesgeld", type: "depository", subtype: "savings", balance: 18000 },
    { key: "card", name: "Kreditkarte", type: "credit", subtype: "credit card", balance: 412.9 },
  ];
  const plaidAccountIds: string[] = [];
  for (const account of bankAccounts) {
    const accountId = `demo-${account.key}-${tag}`;
    plaidAccountIds.push(accountId);
    const fields = {
      currentBalance: account.balance,
      availableBalance: account.balance,
      currency: "EUR",
    };
    await insert("plaidAccounts", {
      userId,
      itemId,
      accountId,
      name: account.name,
      type: account.type,
      subtype: account.subtype,
      mask: "0042",
      ...fields,
      lastSynced: now,
      ...getClassificationFields(
        classifyPlaidAccount({
          type: account.type,
          subtype: account.subtype,
          name: account.name,
        }),
      ),
      ...bankAccountBaseFields(fields, rates),
      baseCurrency: "EUR",
    });
  }
  const bankTransactions = [
    { name: "Gehalt", amount: -3400, days: 14 },
    { name: "Miete", amount: 1150, days: 13 },
    { name: "Supermarkt", amount: 86.35, days: 3 },
  ];
  for (const [i, tx] of bankTransactions.entries()) {
    await insert("plaidTransactions", {
      userId,
      accountId: plaidAccountIds[0],
      plaidTransactionId: `demo-tx-${i}-${tag}`,
      itemId,
      amount: tx.amount,
      currency: "EUR",
      date: isoDay(now - tx.days * DAY_MS),
      name: tx.name,
      pending: false,
      syncedAt: now,
    });
  }

  // ── Broker (SnapTrade) ─────────────────────────────────────────
  const snaptradeUserId = `demo-snaptrade-${tag}`;
  await insert("snaptradeUsers", {
    userId,
    snaptradeUserId,
    snaptradeUserSecret: PLACEHOLDER_SECRET,
    createdAt: now,
  });
  const connectionId = await insert("brokerConnections", {
    userId,
    snaptradeUserId,
    authorizationId: `demo-auth-${tag}`,
    brokerName: "Demo Broker",
    brokerSlug: "DEMO",
    status: "connected",
    lastSyncAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const brokerAccountFields = { balance: 42150, cash: 1150, currency: "EUR" };
  const brokerAccountId = await insert("brokerAccounts", {
    userId,
    connectionId,
    snaptradeAccountId: `demo-account-${tag}`,
    name: "Depot",
    accountType: "CASH",
    ...brokerAccountFields,
    institutionName: "Demo Broker",
    lastSyncAt: now,
    createdAt: now,
    cashInvestmentCategory: "cash",
    cashInvestmentSubcategory: "broker-cash",
    cashSource: "reported",
    ...brokerAccountBaseFields(brokerAccountFields, rates),
  });
  const positions = [
    { symbol: "VWCE", name: "Vanguard FTSE All-World", assetType: "etf", quantity: 280, price: 120, cost: 95 },
    { symbol: "SAP", name: "SAP SE", assetType: "equity", quantity: 30, price: 230, cost: 160 },
  ];
  for (const p of positions) {
    const fields = {
      marketValue: p.quantity * p.price,
      totalCostBasis: p.quantity * p.cost,
      currency: "EUR",
    };
    await insert("brokerPositions", {
      userId,
      accountId: brokerAccountId,
      symbol: p.symbol,
      name: p.name,
      assetType: p.assetType,
      quantity: p.quantity,
      averageCostBasis: p.cost,
      currentPrice: p.price,
      unrealizedPL: fields.marketValue - fields.totalCostBasis,
      ...fields,
      ...getClassificationFields(
        classifySnaptradePosition({
          assetType: p.assetType,
          symbol: p.symbol,
          name: p.name,
          quantity: p.quantity,
          marketValue: fields.marketValue,
        }),
      ),
      ...positionBaseFields(fields, rates),
      lastSyncAt: now,
      createdAt: now,
    });
    await insert("brokerTransactions", {
      userId,
      accountId: brokerAccountId,
      snaptradeActivityId: `demo-buy-${p.symbol}-${tag}`,
      type: "BUY",
      symbol: p.symbol,
      quantity: p.quantity,
      price: p.cost,
      amount: -p.quantity * p.cost,
      currency: "EUR",
      tradeDate: isoDay(now - 400 * DAY_MS),
      createdAt: now,
    });
  }
  // A manual price on the ETF at its synced price (ENG-239): the totals
  // stay as they are, the positions table shows the override
  await insert("valuationOverrides", {
    userId,
    holdingKey: brokerPositionKey(brokerAccountId, positions[0].symbol),
    source: "brokerPosition",
    symbol: positions[0].symbol,
    kind: "manualPrice",
    pricePerUnit: positions[0].price,
    currency: "EUR",
    asOf: isoDay(now),
    createdAt: now,
    updatedAt: now,
  });

  // ── Crypto (Bitpanda) ──────────────────────────────────────────
  const bitpandaConnectionId = await insert("bitpandaConnections", {
    userId,
    apiKey: PLACEHOLDER_SECRET,
    label: "Demo",
    status: "disconnected",
    lastSyncAt: now,
    createdAt: now,
    updatedAt: now,
  });
  const coins = [
    { symbol: "BTC", name: "Bitcoin", quantity: 0.12, price: 82000 },
    { symbol: "ETH", name: "Ethereum", quantity: 1.5, price: 2900 },
  ];
  for (const coin of coins) {
    const marketValue = coin.quantity * coin.price;
    await insert("bitpandaHoldings", {
      userId,
      connectionId: bitpandaConnectionId,
      assetType: "crypto",
      symbol: coin.symbol,
      name: coin.name,
      quantity: coin.quantity,
      currentPrice: coin.price,
      marketValue,
      currency: "EUR",
      priceStatus: "live",
      priceAsOf: now,
      ...getClassificationFields(
        classifyBitpandaPosition({
          assetType: "crypto",
          symbol: coin.symbol,
          name: coin.name,
        }),
      ),
      valueInBaseCurrency: marketValue,
      exchangeRateUsed: 1,
      baseCurrency: "EUR",
      lastSyncAt: now,
      createdAt: now,
    });
    await insert("bitpandaTransactions", {
      userId,
      connectionId: bitpandaConnectionId,
      bitpandaTransactionId: `demo-${coin.symbol}-${tag}`,
      type: "buy",
      symbol: coin.symbol,
      assetType: "crypto",
      quantity: coin.quantity,
      price: coin.price * 0.7,
      amount: coin.quantity * coin.price * 0.7,
      currency: "EUR",
      transactionDate: new Date(now - 300 * DAY_MS).toISOString(),
      createdAt: now,
    });
  }

  // ── Loans ──────────────────────────────────────────────────────
  const loanStart = now - 36 * 30 * DAY_MS;
  const loanId = await insert("loans", {
    userId,
    name: "Baufinanzierung",
    loanType: "ANNUITY",
    originalPrincipal: 250000,
    currentBalance: 232400,
    annualInterestRate: 0.035,
    currency: "EUR",
    termMonths: 300,
    paymentFrequency: "MONTHLY",
    scheduledPayment: 1251.56,
    dayCount: "30/360",
    startDate: isoDay(loanStart),
    expectedEndDate: isoDay(loanStart + 300 * 30 * DAY_MS),
    nextPaymentDate: isoDay(now + 10 * DAY_MS),
    lender: "Demo Bank",
    status: "active",
    createdAt: now,
    updatedAt: now,
  });
  await insert("loanPayments", {
    userId,
    loanId,
    paymentDate: isoDay(now - 20 * DAY_MS),
    scheduledDate: isoDay(now - 20 * DAY_MS),
    amount: 1251.56,
    principalPortion: 573.73,
    interestPortion: 677.83,
    paymentType: "scheduled",
    createdAt: now,
  });
  await insert("loanScenarios", {
    userId,
    loanId,
    name: "200 € extra",
    extraPerPeriod: 200,
    prepaymentEffect: "reduce_term",
    createdAt: now,
    updatedAt: now,
  });

  // ── Manual assets ──────────────────────────────────────────────
  await insert("manualAssets", {
    userId,
    category: "real-estate",
    subcategory: "residential",
    name: "Eigentumswohnung",
    currency: "EUR",
    valuations: [
      { date: isoDay(loanStart), value: 310000 },
      { date: isoDay(now - 60 * DAY_MS), value: 345000 },
    ],
    costBasis: 310000,
    linkedLoanId: loanId,
    attributes: { address: "Musterstraße 1, Berlin" },
    createdAt: now,
    updatedAt: now,
  });

  // ── Pies ───────────────────────────────────────────────────────
  await insert("pies", {
    userId,
    name: "Core & Satellite",
    description: "World ETF core, a little crypto, a cash buffer",
    slices: [
      { weight: 60, target: { kind: "category", category: "equities" } },
      { weight: 20, target: { kind: "category", category: "crypto" } },
      { weight: 20, label: "Cash buffer", target: { kind: "category", category: "cash" } },
    ],
    createdAt: now,
    updatedAt: now,
  });

  // ── Goals ──────────────────────────────────────────────────────
  // An unused tracker first, so it can be deleted; the workouts tracker
  // feeds the trip's counter; the watch goal is archived
  await insert("goalTrackers", { userId, name: "Meditation", kind: "count", createdAt: now });
  const workouts = await insert("goalTrackers", {
    userId,
    name: "Workouts",
    kind: "count",
    unit: "sessions",
    createdAt: now,
  });
  for (const daysAgo of [12, 9, 5, 2]) {
    await insert("goalEntries", {
      userId,
      trackerId: workouts,
      date: isoDay(now - daysAgo * DAY_MS),
      value: 1,
      createdAt: now,
    });
  }
  await insert("goals", {
    userId,
    name: "Lisbon trip",
    description: "A week in Lisbon once it is earned",
    currency: "EUR",
    price: 1500,
    rule: {
      kind: "all",
      children: [
        { kind: "invested", target: { kind: "priceMultiple", multiple: 10 } },
        { kind: "counter", trackerId: workouts, count: 20 },
        { kind: "checklist", items: [{ id: "flights", label: "Compare flights" }] },
      ],
    },
    startDate: isoDay(now - 30 * DAY_MS),
    status: "active",
    checklistDone: [],
    history: [{ at: now, kind: "created" }],
    createdAt: now,
    updatedAt: now,
  });
  await insert("goals", {
    userId,
    name: "Watch",
    currency: "EUR",
    price: 4000,
    rule: { kind: "gains", target: { kind: "priceMultiple", multiple: 1 } },
    startDate: isoDay(now - 60 * DAY_MS),
    status: "archived",
    checklistDone: [],
    history: [
      { at: now, kind: "created" },
      { at: now, kind: "archived" },
    ],
    createdAt: now - 1,
    updatedAt: now,
  });

  // ── Retirement ─────────────────────────────────────────────────
  await insert("retirementPlans", {
    userId,
    currentStep: 1,
    status: "active",
    birthDate: "1988-04-12",
    currentAge: 38,
    retirementAge: 63,
    currency: "EUR",
    monthlyExpensesToday: 2800,
    ownsPrimaryResidence: true,
    primaryResidenceLoanId: loanId,
    pensionSources: [{ label: "Gesetzliche Rente", monthlyAmount: 1400, gross: true }],
    inflationRate: DEFAULT_INFLATION_RATE,
    withdrawalRate: DEFAULT_WITHDRAWAL_RATE,
    optimisticReturn: DEFAULT_OPTIMISTIC_RETURN,
    conservativeReturn: DEFAULT_CONSERVATIVE_RETURN,
    createdAt: now,
    updatedAt: now,
  });

  // ── Vault ──────────────────────────────────────────────────────
  const purchaseDate = isoDay(now - 700 * DAY_MS);
  const vaultItemId = await insert("vaultItems", {
    userId,
    customName: "Goldbarren 100 g",
    metalType: "gold",
    category: "bar",
    purity: 0.9999,
    weightGrams: 100,
    fineWeightGrams: 99.99,
    quantity: 2,
    buyPremium: 0.03,
    sellPremium: 0,
    purchasePricePerUnit: 6100,
    purchaseDate,
    purchaseCurrency: "EUR",
    storageLocation: "Schließfach",
    createdAt: now,
    updatedAt: now,
  });
  await insert("vaultTransactions", {
    userId,
    vaultItemId,
    transactionType: "buy",
    quantity: 2,
    pricePerUnit: 6100,
    currency: "EUR",
    pricePerUnitBase: 6100,
    transactionDate: purchaseDate,
    isOpening: true,
    createdAt: now,
  });

  // ── World Bank, API key, net-worth history ─────────────────────
  await insert("worldBankFavorites", {
    userId,
    indicatorCode: "NY.GDP.MKTP.CD",
    indicatorName: "GDP (current US$)",
    addedAt: now,
  });
  await insert("apiKeys", {
    userId,
    name: "Demo key",
    // Not the hash of any issued key, so it authenticates nothing
    keyHash: `demo-${tag}-${now}`,
    keyPrefix: "fsk_demo",
    scopes: ["networth:read"],
    createdAt: now,
  });
  for (let daysAgo = 29; daysAgo >= 1; daysAgo--) {
    const netWorth = 90000 + (29 - daysAgo) * 120;
    await insert("portfolioSnapshots", {
      userId,
      timestamp: now - daysAgo * DAY_MS,
      date: isoDay(now - daysAgo * DAY_MS),
      totalAssets: netWorth + 232800,
      totalLiabilities: 232800,
      netWorth,
      source: "demo-seed",
    });
  }
  return ids;
}
