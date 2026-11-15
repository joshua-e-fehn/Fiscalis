# ADR 0001: Valuation resolution and the D1-D4 decisions

- **Status:** Accepted, implemented (owner decisions approved 2026-11-11)
- **Tracking:** ENG-160 (umbrella, done) and children ENG-161..173; leftovers in ENG-174 (done)
- **Supersedes:** the untracked draft `docs/VALUATION_RESOLUTION_PLAN.md` and, for
  strategy selection, [`archive/PERFORMANCE_CALCULATION_SERVICE.md`](../archive/PERFORMANCE_CALCULATION_SERVICE.md)

## Context

An audit of every valuation and performance path (2026-11) found history that
froze after a fixed snapshot count, P/L that counted deposits as profit, four
FX paths, and a client and server that computed net worth differently. The
performance strategy (discrete, continuous or hybrid) was chosen by which KPI
card a page rendered, not by what the holding is. The fixes needed one rule
for how each holding is valued and four owner decisions on what the numbers
mean.

## Decision

### Valuation resolution chain

A holding's valuation method comes from three tiers, the most specific
winning:

```
asset override  →  subcategory override  →  category default
```

- Every category defaults to `discrete` (valued from snapshots).
- Only subcategories that differ are listed. Stocks, ETFs, options, REITs,
  bitcoin, ethereum, altcoins and metals are `continuous`; funds,
  stablecoins and NFTs are `semi-continuous` (computed with the discrete
  algorithm). A new subcategory inherits its category default and needs no
  entry.
- `continuous` takes effect only when a price feed with a **history**
  exists for the provider (`PRICE_FEEDS`). Today that is vault metals alone.
  Everything else is valued from snapshots until a history is added through
  that seam.
- A feed without history is a **live** feed (ENG-239): Bitpanda's public
  ticker every 10 minutes and SnapTrade quotes hourly in trading hours
  re-price the holdings the feed covers between full syncs
  (`priceFeedFor`, `services/pricing/livePrices.ts`,
  `frontend/convex/assetPrices.ts`). Totals and the live end of a chart
  are current; the history is still the snapshots'.
- **Tier 3** (per-asset override) is stored in its own table,
  `valuationOverrides`, keyed by the holding's sync-stable key, because
  syncs replace the holding rows. An override is a manual price or a
  mark-to-model (`services/pricing/valuationOverride.ts`). It resolves to
  `discrete` with the `manual` provider, takes the holding off its live
  feed, and is applied by every net-worth figure (`lib/netWorth.ts`).
  Coverage and gaps per asset class: [`docs/PRICING_GAPS.md`](../PRICING_GAPS.md).
- The registry keys subcategories by category, because ids repeat
  (`equities.funds`, `bonds.funds`). It uses the aggregator's
  `HoldingCategory`, so `services/` does not import from `frontend/`.
- Pages call one entry point, `useCategoryPerformance`
  (`frontend/hooks/performance/`), and never pick a strategy themselves.

Code: `services/performance/config.ts` (`resolveValuationConfig`,
`getValueTypeForConfig`, `continuousSourcesFor`) and the types in
`services/performance/types.ts`.

### Owner decisions

- **D1:** loans count toward liabilities when active or defaulted;
  paid_off and refinanced do not. One predicate, `loanCountsAsLiability`
  (`services/portfolio/categorySummary.ts`), used by the aggregator, the
  liabilities queries and the retirement planner.
- **D2:** net worth is the plain value change; investment categories are
  flow-adjusted (P/L = Δvalue − net flows; Modified Dietz, chained into a
  time-weighted return where flows are known). See
  `services/performance/strategies/base.ts` and `services/portfolio/aggregate.ts`.
- **D3:** a missing purchase date means held before the range; new metal
  entries require a date. See `services/finance/metalsLedger.ts` and
  `frontend/convex/vault.ts`.
- **D4:** retirement methodology changes are made now: exact horizon,
  monthly annuity, per-category funding base, gross pensions, primary
  residence mortgage. The header of `services/finance/retirementService.ts`
  is the reference.

## Consequences

- Adding a subcategory or a price feed is a one-line registry change, not a
  page change.
- Snapshot-valued holdings cannot show intraday history. That is accepted
  until a history feed exists; their current value is live where a live
  feed covers them.
- The YTD card for net worth is labelled a change, not a return (D2).

## Not decided / deferred

- Continuous (history) feeds for equities and crypto: live feeds exist
  since ENG-239; recording their closes is the next step
  (`docs/PRICING_GAPS.md`). New vendors are the owner's decision.
- Whether `semi-continuous` gets its own algorithm or stays a tuned discrete
  variant.
