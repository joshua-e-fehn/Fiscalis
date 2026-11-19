import { Migrations } from "@convex-dev/migrations";
import { v } from "convex/values";
import { components, internal } from "./_generated/api";
import type { DataModel } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
} from "./_generated/server";
import {
  REMAP_BATCH_SIZE,
  REMAP_COUNT_PAGE_SIZE,
  describeCounts,
  remapArgsRefusal,
} from "../../services/auth/clerkUserIdRemap";
import { USER_DATA_TABLE_NAMES } from "../../services/privacy/userData";
import {
  isLegacyInterestOnlyThenPayment,
  loanBalanceAdjustment,
  rederiveScheduledPayment,
} from "../../services/finance/loanScheduleService";
import {
  classifyPlaidAccount,
  classifySnaptradePosition,
  getClassificationFields,
} from "../../services/classification";
import { loadFxRates } from "./fxRates";
import { USER_DATA_TABLES } from "./onboarding";
import { distinctUserIds, SYNC_SOURCE_TABLES } from "./lib/syncTargets";
import {
  asLedgerTransaction,
  basePricePerUnit,
  ensureOpeningTransaction,
  isOpeningTransaction,
  itemTransactions,
  syncProjection,
  toBaseAmountWith,
} from "./vault";
import { ledgerOverCounts } from "../../services/finance/metalsLedger";
import { collapseIntradaySnapshots as intradayRowsToDrop } from "../../services/portfolio/aggregate";
import {
  bankAccountBaseFields,
  brokerAccountBaseFields,
  positionBaseFields,
} from "../../services/finance/currency";
import { describeError } from "../../services/security/providerError";
import { parseSecurityTrade } from "../../services/banking/securityTrades";

/**
 * New migrations use the @convex-dev/migrations component (convex.config.ts):
 * `migrations.define` runs a per-document function over a table in batches,
 * records progress so a failed or interrupted run resumes where it stopped,
 * and refuses a duplicate concurrent run. The older one-transaction
 * internalMutations below stay as they are; port one only when it is
 * touched again (backfillLoanScenarioExtraPerPeriod is the worked example).
 *
 * Run one (dry run first: one batch, then rolled back):
 *   npx convex run migrations:run '{"fn": "migrations:<name>", "dryRun": true}'
 *   npx convex run migrations:run '{"fn": "migrations:<name>"}'
 * Status: npx convex run --component migrations lib:getStatus --watch
 */
export const migrations = new Migrations<DataModel>(components.migrations);

/** General-purpose runner: `migrations:run '{"fn": "migrations:<name>"}'`. */
export const run = migrations.runner();

/**
 * Migration: Update metalCatalog and vaultItems to use buyPremium/sellPremium
 *
 * This migration converts the old `premium` field to the new
 * `buyPremium` and `sellPremium` fields.
 *
 * Run once: await ctx.runMutation(api.migrations.migratePremiums)
 */
export const migratePremiums = internalMutation({
  args: {},
  handler: async (ctx) => {
    let catalogUpdated = 0;
    let itemsUpdated = 0;

    // Update metalCatalog entries
    const catalogItems = await ctx.db.query("metalCatalog").collect();
    for (const item of catalogItems) {
      // Check if item has old schema (defaultPremium instead of defaultBuyPremium)
      if (
        item.defaultPremium !== undefined &&
        item.defaultBuyPremium === undefined
      ) {
        await ctx.db.patch(item._id, {
          defaultBuyPremium: item.defaultPremium,
          defaultSellPremium: 0.0, // Default sell at spot
        });
        // Note: We can't delete the old field in Convex, but schema validation will ignore it
        catalogUpdated++;
      }
    }

    // Update vaultItems entries
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      // Check if item has old schema (premium instead of buyPremium)
      if (item.premium !== undefined && item.buyPremium === undefined) {
        await ctx.db.patch(item._id, {
          buyPremium: item.premium,
          sellPremium: 0.0, // Default sell at spot
        });
        itemsUpdated++;
      }
    }

    return {
      message: "Migration completed",
      catalogUpdated,
      itemsUpdated,
    };
  },
});

/**
 * Clean up old fields after migration
 * This removes the deprecated fields from documents
 */
export const cleanupOldPremiumFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    let catalogCleaned = 0;
    let itemsCleaned = 0;

    // Clean metalCatalog
    const catalogItems = await ctx.db.query("metalCatalog").collect();
    for (const item of catalogItems) {
      if (item.defaultPremium !== undefined) {
        // Replace the entire document without the old field
        const { defaultPremium, _id, _creationTime, ...rest } = item;
        await ctx.db.replace(_id, rest);
        catalogCleaned++;
      }
    }

    // Clean vaultItems
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      if (item.premium !== undefined) {
        // Replace the entire document without the old field
        const { premium, _id, _creationTime, ...rest } = item;
        await ctx.db.replace(_id, rest);
        itemsCleaned++;
      }
    }

    return {
      message: "Cleanup completed",
      catalogCleaned,
      itemsCleaned,
    };
  },
});

// ═══════════════════════════════════════════════════════════════
// CLASSIFICATION MIGRATIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Migration: Classify all existing Plaid accounts
 *
 * This migration applies the classification engine to all existing
 * Plaid accounts that don't have a classification yet.
 *
 * Run: await ctx.runMutation(api.migrations.classifyPlaidAccounts)
 */
export const classifyPlaidAccounts = internalMutation({
  args: {},
  handler: async (ctx) => {
    let classified = 0;
    let skipped = 0;
    let errors = 0;

    const accounts = await ctx.db.query("plaidAccounts").collect();

    for (const account of accounts) {
      try {
        // Skip if already classified (unless we want to re-classify)
        if (account.investmentCategory && !account.userCategoryOverride) {
          skipped++;
          continue;
        }

        // Skip if user has an override
        if (account.userCategoryOverride) {
          skipped++;
          continue;
        }

        const classification = classifyPlaidAccount({
          type: account.type,
          subtype: account.subtype ?? null,
          name: account.name,
        });

        const fields = getClassificationFields(classification);

        await ctx.db.patch(account._id, fields);
        classified++;
      } catch (error) {
        console.error(`Error classifying account ${account._id}:`, describeError(error));
        errors++;
      }
    }

    return {
      message: "Plaid account classification completed",
      totalAccounts: accounts.length,
      classified,
      skipped,
      errors,
    };
  },
});

/**
 * Migration: Classify all existing broker positions
 *
 * This migration applies the classification engine to all existing
 * broker positions and converts their values to base currency.
 *
 * Run: await ctx.runMutation(api.migrations.classifyBrokerPositions)
 */
export const classifyBrokerPositions = internalMutation({
  args: {},
  handler: async (ctx) => {
    let classified = 0;
    let skipped = 0;
    let errors = 0;

    const positions = await ctx.db.query("brokerPositions").collect();
    const rates = await loadFxRates(ctx);

    for (const position of positions) {
      try {
        // Skip if user has an override
        if (position.userCategoryOverride) {
          skipped++;
          continue;
        }

        const classification = classifySnaptradePosition({
          assetType: position.assetType,
          symbol: position.symbol,
          name: position.name ?? null,
          quantity: position.quantity,
          marketValue: position.marketValue ?? null,
        });

        const classificationFields = getClassificationFields(classification);

        // Convert to base currency
        const currencyFields = positionBaseFields(position, rates);

        await ctx.db.patch(position._id, {
          ...classificationFields,
          ...currencyFields,
        });
        classified++;
      } catch (error) {
        console.error(`Error classifying position ${position._id}:`, describeError(error));
        errors++;
      }
    }

    return {
      message: "Broker position classification completed",
      totalPositions: positions.length,
      classified,
      skipped,
      errors,
    };
  },
});

/**
 * Migration: Re-classify all items (force update)
 *
 * This migration re-classifies ALL items, even those already classified.
 * User overrides are preserved.
 *
 * Run: await ctx.runMutation(api.migrations.reclassifyAll)
 */
export const reclassifyAll = internalMutation({
  args: {},
  handler: async (ctx) => {
    let plaidClassified = 0;
    let positionsClassified = 0;
    let plaidSkipped = 0;
    let positionsSkipped = 0;

    // Re-classify Plaid accounts
    const accounts = await ctx.db.query("plaidAccounts").collect();
    for (const account of accounts) {
      // Skip if user has an override
      if (account.userCategoryOverride) {
        plaidSkipped++;
        continue;
      }

      const classification = classifyPlaidAccount({
        type: account.type,
        subtype: account.subtype ?? null,
        name: account.name,
      });

      await ctx.db.patch(account._id, getClassificationFields(classification));
      plaidClassified++;
    }

    // Re-classify broker positions
    const positions = await ctx.db.query("brokerPositions").collect();
    const rates = await loadFxRates(ctx);
    for (const position of positions) {
      // Skip if user has an override
      if (position.userCategoryOverride) {
        positionsSkipped++;
        continue;
      }

      const classification = classifySnaptradePosition({
        assetType: position.assetType,
        symbol: position.symbol,
        name: position.name ?? null,
        quantity: position.quantity,
        marketValue: position.marketValue ?? null,
      });

      const classificationFields = getClassificationFields(classification);

      // Update currency conversion
      const currencyFields = positionBaseFields(position, rates);

      await ctx.db.patch(position._id, {
        ...classificationFields,
        ...currencyFields,
      });
      positionsClassified++;
    }

    return {
      message: "Re-classification completed",
      plaid: {
        total: accounts.length,
        classified: plaidClassified,
        skipped: plaidSkipped,
      },
      brokerPositions: {
        total: positions.length,
        classified: positionsClassified,
        skipped: positionsSkipped,
      },
    };
  },
});

/**
 * Get classification statistics
 *
 * Returns a summary of how items are classified across the database.
 * Useful for debugging and monitoring.
 */
export const getClassificationStats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const plaidAccounts = await ctx.db.query("plaidAccounts").collect();
    const brokerPositions = await ctx.db.query("brokerPositions").collect();

    // Plaid stats
    const plaidByCategory: Record<string, number> = {};
    let plaidUnclassified = 0;
    let plaidWithOverride = 0;

    for (const acc of plaidAccounts) {
      if (acc.userCategoryOverride) plaidWithOverride++;
      const cat = acc.investmentCategory ?? "unclassified";
      if (cat === "unclassified") plaidUnclassified++;
      plaidByCategory[cat] = (plaidByCategory[cat] ?? 0) + 1;
    }

    // Position stats
    const positionsByCategory: Record<string, number> = {};
    let positionsUnclassified = 0;
    let positionsWithOverride = 0;

    for (const pos of brokerPositions) {
      if (pos.userCategoryOverride) positionsWithOverride++;
      const cat = pos.investmentCategory ?? "unclassified";
      if (cat === "unclassified") positionsUnclassified++;
      positionsByCategory[cat] = (positionsByCategory[cat] ?? 0) + 1;
    }

    return {
      plaidAccounts: {
        total: plaidAccounts.length,
        unclassified: plaidUnclassified,
        withUserOverride: plaidWithOverride,
        byCategory: plaidByCategory,
      },
      brokerPositions: {
        total: brokerPositions.length,
        unclassified: positionsUnclassified,
        withUserOverride: positionsWithOverride,
        byCategory: positionsByCategory,
      },
    };
  },
});

/**
 * Migration: Reclassify NFTs from crypto to collectibles
 *
 * NFTs were previously classified as crypto/nfts. They now belong to
 * collectibles/nfts. This migration updates existing positions and accounts
 * that were classified under the old scheme.
 *
 * User overrides are preserved.
 *
 * Run: await ctx.runMutation(api.migrations.reclassifyNftsToCollectibles)
 */
export const reclassifyNftsToCollectibles = internalMutation({
  args: {},
  handler: async (ctx) => {
    let positionsUpdated = 0;
    let positionsSkipped = 0;
    let accountsUpdated = 0;
    let accountsSkipped = 0;

    // Reclassify broker positions
    const positions = await ctx.db.query("brokerPositions").collect();
    for (const position of positions) {
      if (
        position.investmentCategory === "crypto" &&
        position.investmentSubcategory === "nfts"
      ) {
        if (position.userCategoryOverride) {
          positionsSkipped++;
          continue;
        }
        await ctx.db.patch(position._id, {
          investmentCategory: "collectibles",
          investmentSubcategory: "nfts",
        });
        positionsUpdated++;
      }
    }

    // Reclassify Plaid accounts (unlikely for NFTs, but check anyway)
    const accounts = await ctx.db.query("plaidAccounts").collect();
    for (const account of accounts) {
      if (
        account.investmentCategory === "crypto" &&
        account.investmentSubcategory === "nfts"
      ) {
        if (account.userCategoryOverride) {
          accountsSkipped++;
          continue;
        }
        await ctx.db.patch(account._id, {
          investmentCategory: "collectibles",
          investmentSubcategory: "nfts",
        });
        accountsUpdated++;
      }
    }

    return {
      message: "NFT reclassification completed (crypto → collectibles)",
      positions: {
        updated: positionsUpdated,
        skippedUserOverride: positionsSkipped,
      },
      accounts: {
        updated: accountsUpdated,
        skippedUserOverride: accountsSkipped,
      },
    };
  },
});

/**
 * Migration: Backfill base-currency fields
 *
 * Stamps every Plaid account, broker account and broker position with the
 * base-currency (EUR) fields the aggregators now read exclusively
 * (services/finance/currency.ts), at the current rate table: the mirrored
 * fxRates, or the flagged fallback table for currencies it does not cover.
 * Rows in a currency with no rate get no base value and source "unknown".
 *
 * Plaid accounts stored with the old "USD" default cannot be told apart from
 * real USD accounts; the next Plaid sync rewrites their currency.
 *
 * Until it runs, the readers stamp rows without `exchangeRateSource` at
 * read time (services/finance/currency.ts positionWithBaseFields and
 * siblings), so totals are right from deploy; the backfill persists those
 * values (and clears the deprecated exchangeRateTimestamp).
 *
 * Idempotent; the next provider sync re-stamps the same fields.
 * Run after the first successful fxRates.refreshFxRates so the rows carry
 * market rates:
 *   npx convex run fxRates:refreshFxRates '{"from":"2015-01-01"}'
 *   npx convex run migrations:backfillBaseCurrencyFields
 */
export const backfillBaseCurrencyFields = internalMutation({
  args: {},
  handler: async (ctx) => {
    const rates = await loadFxRates(ctx);
    const unknown: string[] = [];

    const bankAccounts = await ctx.db.query("plaidAccounts").collect();
    for (const account of bankAccounts) {
      const fields = bankAccountBaseFields(account, rates);
      if (fields.exchangeRateSource === "unknown") unknown.push(account._id);
      await ctx.db.patch(account._id, fields);
    }

    const brokerAccounts = await ctx.db.query("brokerAccounts").collect();
    for (const account of brokerAccounts) {
      const fields = brokerAccountBaseFields(account, rates);
      if (fields.exchangeRateSource === "unknown") unknown.push(account._id);
      await ctx.db.patch(account._id, fields);
    }

    const positions = await ctx.db.query("brokerPositions").collect();
    for (const position of positions) {
      const fields = positionBaseFields(position, rates);
      if (fields.exchangeRateSource === "unknown") unknown.push(position._id);
      await ctx.db.patch(position._id, fields);
    }

    return {
      plaidAccounts: bankAccounts.length,
      brokerAccounts: brokerAccounts.length,
      brokerPositions: positions.length,
      unconverted: unknown,
    };
  },
});

/**
 * Migration: make vaultTransactions the complete ledger of every vault item.
 *
 * For each item: flags the legacy "Initial purchase" transaction as the
 * opening balance, writes the opening balance an item stored before every
 * change went through the ledger is missing (the cached quantity minus what
 * its transactions add up to, at the item's purchase price and date;
 * undated when it has none, D3), then rewrites the cached quantity and
 * average cost (EUR) from the replay. Every priced transaction without an
 * EUR price gets one at the FX rate of its date (`pricePerUnitBase`), so
 * replays stop moving with today's rates. Idempotent. An item whose ledger
 * sells more than it holds, or adds up to more than its cached quantity
 * (an older direct quantity edit), keeps its cached fields and is reported.
 *
 * Run once: npx convex run migrations:backfillVaultLedger
 */
export const backfillVaultLedger = internalMutation({
  args: {},
  handler: async (ctx) => {
    const toBaseAmount = toBaseAmountWith(await loadFxRates(ctx));
    let openingsFlagged = 0;
    let openingsWritten = 0;
    let projectionsUpdated = 0;
    let basePricesWritten = 0;
    const unreplayable: string[] = [];
    const overCounted: string[] = [];

    for (const item of await ctx.db.query("vaultItems").collect()) {
      const before = await itemTransactions(ctx, item._id);
      for (const tx of before) {
        if (tx.pricePerUnitBase !== undefined || tx.pricePerUnit === undefined) {
          continue;
        }
        const pricePerUnitBase = await basePricePerUnit(ctx, tx);
        if (pricePerUnitBase !== undefined) {
          await ctx.db.patch(tx._id, { pricePerUnitBase });
          basePricesWritten++;
        }
      }
      if (ledgerOverCounts(item, before.map(asLedgerTransaction))) {
        overCounted.push(
          `${item._id}: transactions exceed the cached quantity ${item.quantity}`,
        );
        continue;
      }
      if (!before.some((tx) => tx.isOpening)) {
        const legacy = before.find(isOpeningTransaction);
        if (legacy) {
          await ctx.db.patch(legacy._id, { isOpening: true });
          openingsFlagged++;
        }
      }
      const after = await ensureOpeningTransaction(ctx, item);
      if (after.length > before.length) openingsWritten++;
      try {
        const ledger = await syncProjection(ctx, item._id, toBaseAmount);
        if (
          ledger.quantity !== item.quantity ||
          (ledger.averageCost ?? undefined) !== item.purchasePricePerUnit
        ) {
          projectionsUpdated++;
        }
      } catch (error) {
        unreplayable.push(`${item._id}: ${String(error)}`);
      }
    }

    console.log(
      `backfillVaultLedger: ${openingsFlagged} openings flagged, ` +
        `${openingsWritten} written, ${basePricesWritten} EUR prices written, ` +
        `${projectionsUpdated} projections updated, ` +
        `${unreplayable.length} items not replayable, ` +
        `${overCounted.length} over-counted`,
    );
    return {
      openingsFlagged,
      openingsWritten,
      basePricesWritten,
      projectionsUpdated,
      unreplayable,
      overCounted,
    };
  },
});

/**
 * Migration: loan scenarios stored their per-period extra as
 * `extraMonthlyPayment` (it was never monthly). Copies it to `extraPerPeriod`
 * where that is unset; the old field is kept and still read as a fallback.
 * Idempotent. Component migration (see `migrations` above); dry run first:
 *   npx convex run migrations:run '{"fn": "migrations:backfillLoanScenarioExtraPerPeriod", "dryRun": true}'
 */
export const backfillLoanScenarioExtraPerPeriod = migrations.define({
  table: "loanScenarios",
  migrateOne: (_ctx, scenario) => {
    if (
      scenario.extraPerPeriod !== undefined ||
      scenario.extraMonthlyPayment === undefined
    ) {
      return;
    }
    return { extraPerPeriod: scenario.extraMonthlyPayment };
  },
});

/**
 * Migration: tag the bank transactions that settle a securities trade with
 * their ISIN (plaidTransactions.securityIsin), as applyTransactionChanges
 * now does when it stores one; depot holdings are read from those rows
 * (lib/netWorth.ts). Idempotent. Dry run first:
 *   npx convex run migrations:run '{"fn": "migrations:backfillPlaidSecurityIsin", "dryRun": true}'
 */
export const backfillPlaidSecurityIsin = migrations.define({
  table: "plaidTransactions",
  migrateOne: (_ctx, txn) => {
    const securityIsin = parseSecurityTrade(txn.name)?.isin;
    if (securityIsin === txn.securityIsin) return;
    return { securityIsin };
  },
});

/**
 * Migration: INTEREST_ONLY_THEN loans now store the post-grace annuity as
 * `scheduledPayment` (the engine projects with it). The old add-loan dialog
 * stored an annuity over the whole term, ignoring the grace periods, and the
 * old createLoan fallback stored the interest-only payment; both leave a
 * balloon at the end. Re-derives the payment from the current balance over
 * the periods left after the grace periods. Only loans whose stored payment
 * still equals one of those computed values are rewritten (until then the
 * engine ignores them, see isLegacyInterestOnlyThenPayment); a payment the
 * user typed in is returned in `skipped` for manual review.
 * Idempotent.
 * Dry run first:
 *   npx convex run migrations:backfillInterestOnlyScheduledPayments '{"dryRun": true}'
 */
export const backfillInterestOnlyScheduledPayments = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const loans = await ctx.db.query("loans").collect();
    const changed = [];
    const skipped = [];
    for (const loan of loans) {
      if (
        loan.loanType !== "INTEREST_ONLY_THEN" ||
        loan.status === "paid_off" ||
        loan.currentBalance <= 0
      ) {
        continue;
      }
      if (!isLegacyInterestOnlyThenPayment(loan)) {
        skipped.push({
          loanId: loan._id,
          scheduledPayment: loan.scheduledPayment,
        });
        continue;
      }
      const payments = await ctx.db
        .query("loanPayments")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect();
      const scheduledPayment = rederiveScheduledPayment(loan, payments);
      if (scheduledPayment === loan.scheduledPayment) continue;
      changed.push({
        loanId: loan._id,
        from: loan.scheduledPayment,
        to: scheduledPayment,
      });
      if (!args.dryRun) {
        await ctx.db.patch(loan._id, { scheduledPayment, updatedAt: Date.now() });
      }
    }
    return { scanned: loans.length, changed, skipped };
  },
});

/**
 * Migration: loans now derive currentBalance from originalPrincipal, the
 * principal repaid and `balanceAdjustment` (deriveLoanBalance). Stores
 * stored balance minus the derived one as the adjustment of every loan
 * without one, so the derived balance equals today's stored balance.
 * Leaves currentBalance unchanged. Payment mutations already use the same
 * fallback (loanBalanceAdjustment), so this only makes it explicit.
 * Idempotent. NOT RUN. Dry run first:
 *   npx convex run migrations:backfillLoanBalanceAdjustment '{"dryRun": true}'
 */
export const backfillLoanBalanceAdjustment = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const loans = await ctx.db.query("loans").collect();
    const changed = [];
    for (const loan of loans) {
      if (loan.balanceAdjustment !== undefined) continue;
      const payments = await ctx.db
        .query("loanPayments")
        .withIndex("by_loan", (q) => q.eq("loanId", loan._id))
        .collect();
      const balanceAdjustment = loanBalanceAdjustment(loan, payments);
      changed.push({
        loanId: loan._id,
        currentBalance: loan.currentBalance,
        balanceAdjustment,
      });
      if (!args.dryRun) {
        await ctx.db.patch(loan._id, { balanceAdjustment });
      }
    }
    return { scanned: loans.length, changed };
  },
});

/**
 * Migration: portfolio snapshots written before the one-row-a-day upsert
 * (portfolioSnapshots.takeSnapshot) can hold several rows for one user and
 * day. Keeps each day's newest row and deletes the others
 * (services/portfolio/aggregate.ts collapseIntradaySnapshots). The kept row
 * is the one takeSnapshot already reads as the previous day. Idempotent.
 * NOT RUN: deletes rows, so it waits for the owner's OK. Dry run first, one
 * user at a time if the table is large:
 *   npx convex run migrations:collapseIntradaySnapshots '{"dryRun": true}'
 */
export const collapseIntradaySnapshots = internalMutation({
  args: { dryRun: v.optional(v.boolean()), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = args.userId;
    const rows = userId
      ? await ctx.db
          .query("portfolioSnapshots")
          .withIndex("by_user_date", (q) => q.eq("userId", userId))
          .collect()
      : await ctx.db.query("portfolioSnapshots").collect();
    const { drop } = intradayRowsToDrop(rows);
    if (!args.dryRun) {
      for (const row of drop) await ctx.db.delete(row._id);
    }
    return {
      scanned: rows.length,
      dropped: drop.map((row) => ({
        snapshotId: row._id,
        userId: row.userId,
        date: row.date,
        timestamp: row.timestamp,
      })),
    };
  },
});

/**
 * Migration: the app is now gated behind the onboarding funnel (a user sees
 * the dashboard only once onboardingProgress.onboardingCompleted is true).
 * Marks every user who already has data as onboarded so the gate does not
 * send existing users back through the funnel. A user is anyone with a row in
 * USER_DATA_TABLES (convex/onboarding.ts) or onboardingProgress. Patches an
 * existing progress row (other fields kept) or inserts a completed one.
 * Idempotent. Users without a progress row already pass the gate
 * (onboarding:hasCompletedOnboarding), so this mainly settles users left with
 * an unfinished row from the old optional funnel.
 * NOT RUN. Dry run is the default:
 *   npx convex run migrations:markExistingUsersOnboarded
 *   npx convex run migrations:markExistingUsersOnboarded '{"dryRun": false}'
 */
export const markExistingUsersOnboarded = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const now = Date.now();

    const userIds = await distinctUserIds(ctx, [
      ...USER_DATA_TABLES,
      "onboardingProgress",
    ]);

    const patched: string[] = [];
    const inserted: string[] = [];
    let alreadyCompleted = 0;
    for (const userId of userIds) {
      const progress = await ctx.db
        .query("onboardingProgress")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (progress?.onboardingCompleted) {
        alreadyCompleted++;
        continue;
      }
      if (progress) {
        patched.push(userId);
        if (!dryRun) {
          await ctx.db.patch(progress._id, {
            onboardingCompleted: true,
            completedAt: progress.completedAt ?? now,
            updatedAt: now,
          });
        }
      } else {
        inserted.push(userId);
        if (!dryRun) {
          await ctx.db.insert("onboardingProgress", {
            userId,
            currentStep: 6,
            completedSteps: [1, 2, 3, 4, 5, 6],
            skippedSteps: [],
            profileCompleted: true,
            bankingConnected: false,
            brokersConnected: false,
            cryptoConnected: false,
            onboardingCompleted: true,
            completedAt: now,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    return {
      dryRun,
      users: userIds.size,
      alreadyCompleted,
      patched,
      inserted,
    };
  },
});

/**
 * Migration (ENG-230): register every user with a provider connection, a
 * vault item or a loan in syncTargets, which the daily sync now reads
 * instead of scanning those tables. Inserts only missing rows; idempotent.
 * Run once on each deployment after the schema deploys, before the next
 * 06:00 UTC cron (until then the cron finds no targets and skips users).
 * Dry run is the default:
 *   npx convex run migrations:backfillSyncTargets
 *   npx convex run migrations:backfillSyncTargets '{"dryRun": false}'
 */
export const backfillSyncTargets = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const userIds = await distinctUserIds(ctx, SYNC_SOURCE_TABLES);

    const inserted: string[] = [];
    let alreadyRegistered = 0;
    for (const userId of userIds) {
      const existing = await ctx.db
        .query("syncTargets")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (existing) {
        alreadyRegistered++;
        continue;
      }
      inserted.push(userId);
      if (!dryRun) {
        await ctx.db.insert("syncTargets", { userId, createdAt: Date.now() });
      }
    }

    return { dryRun, users: userIds.size, alreadyRegistered, inserted };
  },
});

// ═══════════════════════════════════════════════════════════════
// CLERK USER ID REMAP
// ═══════════════════════════════════════════════════════════════
//
// Walks services/privacy/userData.ts USER_DATA_TABLES, the list of every
// table with a userId (convex/account.ts fails `tsc` when a table is
// missing from it). Every listed table has a by_user index on userId;
// narrowing the union to one member lets withIndex type-check for all
// (as in account.ts).
type AnyUserTable = "loans";

/** One page of the count of `userId`'s documents in USER_DATA_TABLES[tableIndex]. */
export const countUserIdDocs = internalQuery({
  args: {
    tableIndex: v.number(),
    userId: v.string(),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const table = USER_DATA_TABLE_NAMES[args.tableIndex];
    if (!table) throw new Error(`No user data table at index ${args.tableIndex}`);
    const page = await ctx.db
      .query(table as AnyUserTable)
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .paginate({ cursor: args.cursor, numItems: REMAP_COUNT_PAGE_SIZE });
    return {
      count: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

/** `userId`'s document count in every user data table, keyed by table. */
async function countUserDocs(
  ctx: ActionCtx,
  userId: string,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const [tableIndex, table] of USER_DATA_TABLE_NAMES.entries()) {
    let count = 0;
    let cursor: string | null = null;
    for (;;) {
      const page: { count: number; isDone: boolean; continueCursor: string } =
        await ctx.runQuery(internal.migrations.countUserIdDocs, {
          tableIndex,
          userId,
          cursor,
        });
      count += page.count;
      if (page.isDone) break;
      cursor = page.continueCursor;
    }
    counts[table] = count;
  }
  return counts;
}

const sum = (counts: Record<string, number>) =>
  Object.values(counts).reduce((a, b) => a + b, 0);

/**
 * Migration: move one user's documents from Clerk user ID `from` to `to`,
 * for a change of Clerk instance (development -> production gives the same
 * person a new ID, and every user-owned document stores
 * `userId = identity.subject`). Rewrites `userId` in every table of
 * USER_DATA_TABLES (services/privacy/userData.ts). SnapTrade's own user ID
 * (snaptradeUserId) keeps the old value on purpose, see
 * KEPT_CLERK_ID_FIELDS (services/auth/clerkUserIdRemap.ts). Rate-limiter
 * buckets keyed by the old ID are left to expire.
 *
 * Dry run is the default: it counts `from`'s documents per table and
 * reports documents that already belong to `to`, changing nothing. A real
 * run refuses when `to` already owns documents (a sign-in on the new
 * instance creates userSettings/onboardingProgress rows), unless
 * `force: true`, which merges into them and can leave two rows in
 * one-per-user tables (userSettings, onboardingProgress, snaptradeUsers,
 * syncTargets). It then starts remapUserIdBatch, which patches
 * REMAP_BATCH_SIZE documents per mutation and schedules itself until every
 * table is done, logging each table's count. Re-running the dry run
 * afterwards should report 0 documents left. Idempotent.
 *
 * NOT RUN. Dry run first:
 *   npx convex run migrations:remapUserId '{"from": "user_OLD", "to": "user_NEW"}'
 *   npx convex run migrations:remapUserId '{"from": "user_OLD", "to": "user_NEW", "dryRun": false}'
 */
export const remapUserId = internalAction({
  args: {
    from: v.string(),
    to: v.string(),
    dryRun: v.optional(v.boolean()),
    force: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const refusal = remapArgsRefusal(args.from, args.to);
    if (refusal) throw new Error(`remapUserId refused: ${refusal}`);

    const counts = await countUserDocs(ctx, args.from);
    const collisions = Object.fromEntries(
      Object.entries(await countUserDocs(ctx, args.to)).filter(([, n]) => n > 0),
    );
    const collision =
      sum(collisions) > 0
        ? `documents already belong to ${args.to}: ${describeCounts(collisions)}`
        : null;
    const report = {
      dryRun,
      from: args.from,
      to: args.to,
      total: sum(counts),
      counts,
      collisions,
    };
    console.log(
      `remapUserId${dryRun ? " (dry run)" : ""}: ${report.total} documents of ` +
        `${args.from}: ${describeCounts(counts)}` +
        (collision ? `; ${collision}` : ""),
    );

    if (collision && !args.force && !dryRun) {
      throw new Error(
        `remapUserId refused: ${collision}. Remove them or pass "force": true to merge.`,
      );
    }
    if (dryRun) return { ...report, scheduled: false };

    await ctx.runMutation(internal.migrations.remapUserIdBatch, {
      from: args.from,
      to: args.to,
      tableIndex: 0,
      patched: {},
    });
    return { ...report, scheduled: true };
  },
});

/**
 * One batch of remapUserId: patches up to REMAP_BATCH_SIZE of `from`'s
 * documents in USER_DATA_TABLES[tableIndex] to `to`, then schedules the
 * next batch (the same table until a batch comes back short, then the next
 * table). Patched documents leave the by_user range of `from`, so each
 * batch reads the range from the start. `patched` carries the per-table
 * counts for the final log line.
 */
export const remapUserIdBatch = internalMutation({
  args: {
    from: v.string(),
    to: v.string(),
    tableIndex: v.number(),
    patched: v.record(v.string(), v.number()),
  },
  handler: async (ctx, args) => {
    const table = USER_DATA_TABLE_NAMES[args.tableIndex];
    if (!table) {
      console.log(
        `remapUserId done: ${sum(args.patched)} documents ${args.from} -> ${args.to}: ` +
          describeCounts(args.patched),
      );
      return;
    }
    const docs = await ctx.db
      .query(table as AnyUserTable)
      .withIndex("by_user", (q) => q.eq("userId", args.from))
      .take(REMAP_BATCH_SIZE);
    for (const doc of docs) {
      await ctx.db.patch(doc._id, { userId: args.to });
    }
    const patched = {
      ...args.patched,
      [table]: (args.patched[table] ?? 0) + docs.length,
    };
    const tableDone = docs.length < REMAP_BATCH_SIZE;
    if (tableDone) console.log(`remapUserId: ${table}: ${patched[table]}`);
    await ctx.scheduler.runAfter(0, internal.migrations.remapUserIdBatch, {
      from: args.from,
      to: args.to,
      tableIndex: tableDone ? args.tableIndex + 1 : args.tableIndex,
      patched,
    });
  },
});

/**
 * Migration (ENG-199): grandfather every existing user onto Pro, so the
 * Free limits introduced with billing (two connections, no API keys) take
 * nothing away from anyone who signed up before them. A user is anyone
 * with a row in USER_DATA_TABLES (convex/onboarding.ts) or
 * onboardingProgress. Inserts an open-ended "grandfathered" planGrant where the
 * user has none; idempotent. Run once on prod right after the deploy that
 * adds planGrants. Dry run is the default:
 *   npx convex run migrations:grantProToExistingUsers
 *   npx convex run migrations:grantProToExistingUsers '{"dryRun": false}'
 */
export const grantProToExistingUsers = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const dryRun = args.dryRun ?? true;
    const userIds = await distinctUserIds(ctx, [
      ...USER_DATA_TABLES,
      "onboardingProgress",
    ]);

    const granted: string[] = [];
    let alreadyGranted = 0;
    for (const userId of userIds) {
      const existing = await ctx.db
        .query("planGrants")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .first();
      if (existing) {
        alreadyGranted++;
        continue;
      }
      granted.push(userId);
      if (!dryRun) {
        await ctx.db.insert("planGrants", {
          userId,
          plan: "pro",
          reason: "grandfathered",
          grantedAt: Date.now(),
        });
      }
    }

    return { dryRun, users: userIds.size, alreadyGranted, granted };
  },
});
