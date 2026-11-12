import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import {
  isLegacyInterestOnlyThenPayment,
  rederiveScheduledPayment,
} from "../../services/finance/loanScheduleService";
import {
  classifyPlaidAccount,
  classifySnaptradePosition,
  getClassificationFields,
} from "../../services/classification";
import { loadFxRates } from "./fxRates";
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
      const itemData = item as any;
      if (
        itemData.defaultPremium !== undefined &&
        itemData.defaultBuyPremium === undefined
      ) {
        await ctx.db.patch(item._id, {
          defaultBuyPremium: itemData.defaultPremium,
          defaultSellPremium: 0.0, // Default sell at spot
        } as any);
        // Note: We can't delete the old field in Convex, but schema validation will ignore it
        catalogUpdated++;
      }
    }

    // Update vaultItems entries
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      // Check if item has old schema (premium instead of buyPremium)
      const itemData = item as any;
      if (itemData.premium !== undefined && itemData.buyPremium === undefined) {
        await ctx.db.patch(item._id, {
          buyPremium: itemData.premium,
          sellPremium: 0.0, // Default sell at spot
        } as any);
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
      const itemData = item as any;
      if (itemData.defaultPremium !== undefined) {
        // Replace the entire document without the old field
        const { defaultPremium, _id, _creationTime, ...rest } = itemData;
        await ctx.db.replace(item._id, rest);
        catalogCleaned++;
      }
    }

    // Clean vaultItems
    const vaultItems = await ctx.db.query("vaultItems").collect();
    for (const item of vaultItems) {
      const itemData = item as any;
      if (itemData.premium !== undefined) {
        // Replace the entire document without the old field
        const { premium, _id, _creationTime, ...rest } = itemData;
        await ctx.db.replace(item._id, rest);
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
        console.error(`Error classifying account ${account._id}:`, error);
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
        console.error(`Error classifying position ${position._id}:`, error);
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
        } as any);
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
        } as any);
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
 * Idempotent. Dry run first:
 *   npx convex run migrations:backfillLoanScenarioExtraPerPeriod '{"dryRun": true}'
 */
export const backfillLoanScenarioExtraPerPeriod = internalMutation({
  args: { dryRun: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const scenarios = await ctx.db.query("loanScenarios").collect();
    const changed = [];
    for (const scenario of scenarios) {
      if (
        scenario.extraPerPeriod !== undefined ||
        scenario.extraMonthlyPayment === undefined
      ) {
        continue;
      }
      changed.push({
        scenarioId: scenario._id,
        extraPerPeriod: scenario.extraMonthlyPayment,
      });
      if (!args.dryRun) {
        await ctx.db.patch(scenario._id, {
          extraPerPeriod: scenario.extraMonthlyPayment,
        });
      }
    }
    return { scanned: scenarios.length, changed };
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
