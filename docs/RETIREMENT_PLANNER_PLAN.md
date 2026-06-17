# Retirement Planner ("Rentenplaner") — Implementation Plan

> A step-by-step, tickable plan for adding a retirement / pension planning feature to Fiscalis.
> The feature lets a user define when they want to retire and the lifestyle they want, then
> computes the portfolio they need (via the 4% rule), how far along they already are, and how
> much they must save each month — with plain-language explanations for non-experts.

---

## ✅ Implementation status (updated)

**Phases 1–6 complete and verified** (math + tests, data layer, wizard, step content, results dashboard, edge cases). Phase 7 (manual browser walkthrough + live Convex deploy) is the only outstanding item.

Notable deviations from the original plan (all intentional):
- **Default optimistic return is `0.0718` (7.18%), not 7.5%** — chosen so a portfolio doubles exactly every 10 years (`2^(1/10) − 1`). Conservative stays 5%. Rate references below updated.
- **No server-side `getRetirementResults` query.** `services/` sits outside Convex's project root, so the pure math is composed **client-side** in `useRetirementResults` (equally live via reactive `useQuery`). Convex only persists the plan.
- **Age comes from date of birth.** Added `userSettings.birthDate` (collected in onboarding ProfileStep + the wizard's PersonalStep), so PersonalStep is DOB-driven and age is always derived/fresh.
- **No `/retirement/layout.tsx`** — the parent `(root)/layout.tsx` already supplies the sidebar/auth chrome; a sub-layout would be redundant (retirement has no tabs).
- **Projection chart shows 4 paths** (expected/conservative × with/without monthly saving) + target line, beyond the original 2-line spec.

---

## 0. Decisions locked in (from brainstorming)

| Decision | Choice |
|---|---|
| Plan model | **Single active plan** per user (editable anytime; scenarios can come later) |
| UX | **Dedicated route flow** (stepped wizard → results dashboard), **English route** |
| Route | **`/retirement`** (base). Wizard + dashboard live here. *(not `/rentenplaner`)* |
| Pension income | **Flexible list** of monthly income sources (label + amount) |
| Portfolio basis | **Total net worth by default** (`getTotalNetWorth()`), **with explicit real-estate handling** |
| Real estate | Owner-occupied home is **excluded** from the 4%-rule portfolio; its benefit is the **lower monthly expenses** (no rent). Net worth does not track property today, so a dedicated housing step captures it. |

---

## 1. The calculation model (single source of truth)

All money is in the user's base currency (EUR). `n = retirementAge − currentAge` (years to retirement).

```
1.  expenseFuture   = monthlyExpensesToday × (1 + inflation)^n          // future € at retirement
2.  pensionMonthly  = Σ pensionSources[i].monthlyAmount
3.  gapMonthly      = max(0, expenseFuture − pensionMonthly)            // portfolio must fund this
4.  gapAnnual       = gapMonthly × 12
5.  targetPortfolio = gapAnnual / withdrawalRate                       // 4% rule ⇒ × 25
6.  fundableNow     = netWorth (excl. primary residence) + fundableRealEstateEquity
7.  projectedFromCurrent = fundableNow × (1 + r)^n                     // current assets grow on their own
8.  remainingGap    = max(0, targetPortfolio − projectedFromCurrent)
9.  monthlyContribution(r) = required savings whose future value = remainingGap   // see §5 helper
10. progressPct     = fundableNow / PV(targetPortfolio, r, n)          // how close today
11. earliestRetireAge = currentAge + yearsToReach(fundableNow, targetPortfolio, contribution, r)
```

Run steps 7–11 for **two return assumptions**:
- **Optimistic** `r = 7.18%` (doubles ~every 10 years: `2^(1/10) − 1`) — *implemented as `0.0718`*
- **Conservative** `r = 5%`

### Why this is internally consistent (put this in the UI explainer)
- **Pre-retirement:** we inflate the expense target (2%/yr) and grow assets in **nominal** terms (7.5% / 5%).
- **Post-retirement:** the **4% rule already accounts for inflation** — that's *why* it's 4% and not 7–8%:
  `expected return 7–8% − inflation ~2% − a conservative buffer ≈ 4%`.
- So we never double-count inflation. This reasoning is shown to the user verbatim (plain language).

---

## 2. Reuse audit — what already exists (do NOT reimplement)

**Finance math** — [`services/finance/financeService.ts`](../services/finance/financeService.ts):
- ✅ `calculateEndCapitalValueWithCompoundInterest(start, rate, periods)` — step 7
- ✅ `calculateStartCapitalValueWithCompoundInterest(end, rate, periods)` — PV for step 10
- ✅ `calculateAnnuityPayment(principal, periodicRate, n)` — PMT, composes into step 9
- ✅ `calculateCapitalGainDurationWithCompoundInterest(start, end, rate)` — step 11
- ❌ inflation adjustment, 4%-rule target, required-contribution-with-existing-portfolio → **add in §5**

**Portfolio value** — [`frontend/convex/portfolio.ts`](../frontend/convex/portfolio.ts):
- ✅ `getTotalNetWorth()` → `{ total, providers, lastUpdated }` (EUR base, all providers, liabilities netted)
- ✅ `getCategoryBreakdown()`, `getProviderAllocation()` for optional drill-down
- ✅ Auth pattern: `const identity = await ctx.auth.getUserIdentity(); const userId = identity.subject;`

**Wizard pattern to mirror** — onboarding:
- [`frontend/components/atomic/organisms/onboarding/OnboardingFlow.tsx`](../frontend/components/atomic/organisms/onboarding/OnboardingFlow.tsx) (enum steps, master state machine, framer-motion direction)
- [`frontend/components/atomic/organisms/onboarding/steps/`](../frontend/components/atomic/organisms/onboarding/steps/) (per-step components, `useState` forms)
- [`frontend/convex/onboarding.ts`](../frontend/convex/onboarding.ts) + [`frontend/hooks/convex/onboarding.ts`](../frontend/hooks/convex/onboarding.ts) (persisted progress)

**UI kit:** shadcn (`@/components/ui/shadcn/*`), `lucide-react` icons, **recharts** for charts, Tailwind dark-theme classes (`bg-white/[0.03] border-white/[0.1]`), zod available.

**Key finding:** No real-estate table exists → net worth excludes property today → **no double-counting**. The wizard's housing step is the single place property enters the model.

---

## 3. Architecture overview

```
services/finance/
  retirementService.ts        ← NEW: pure, framework-free retirement math (client + convex import it)

frontend/convex/
  schema.ts                   ← EDIT: add `retirementPlans` table
  retirement.ts               ← NEW: get/save/reset plan + computed-results query

frontend/hooks/convex/
  retirement.ts               ← NEW: useRetirementPlan, useSaveRetirementPlan, useRetirementResults
  index.ts                    ← EDIT: re-export

frontend/lib/types/
  retirement.ts               ← NEW: RetirementStep enum, input/result TS types

frontend/app/(root)/retirement/
  layout.tsx                  ← NEW
  page.tsx                    ← NEW: dashboard if plan exists, else launch wizard

frontend/components/atomic/organisms/retirement/
  RetirementFlow.tsx          ← NEW: master wizard state machine (mirrors OnboardingFlow)
  steps/
    IntroStep.tsx
    PersonalStep.tsx          (current age / birthdate, retirement age)
    ExpensesStep.tsx          (monthly living expenses today + inflation preview)
    HousingStep.tsx           (own home? fundable property equity? edge cases)
    PensionSourcesStep.tsx    (flexible list of monthly incomes)
    PortfolioStep.tsx         (shows net worth basis, adjustments)
    AssumptionsStep.tsx       (advanced: returns/inflation/withdrawal — sensible defaults)
    ResultsStep.tsx           (target, progress, required savings, charts, explainer)
  shared/
    RetirementStepShell.tsx   (reused card/nav/animation wrapper)

frontend/components/atomic/molecules/retirement/
  RetirementProgressCard.tsx
  RequiredSavingsCard.tsx     (optimistic vs conservative)
  RetirementProjectionChart.tsx  (recharts: portfolio growth vs target line)
  FourPercentRuleExplainer.tsx   (educational, plain language)
  PensionCoverageBreakdown.tsx   (expense → pension vs portfolio split)
```

---

## 4. Data model

### 4.1 Convex schema — `retirementPlans` (single row per user)
- [x] Add table to [`frontend/convex/schema.ts`](../frontend/convex/schema.ts), indexed `by_user` on `["userId"]` (also added `birthDate` to `userSettings`):

```ts
retirementPlans: defineTable({
  userId: v.string(),

  // wizard state
  currentStep: v.number(),
  status: v.union(v.literal("draft"), v.literal("active")),

  // personal
  birthDate: v.optional(v.string()),      // ISO; preferred
  currentAge: v.number(),                  // derived/entered fallback
  retirementAge: v.number(),

  // lifestyle
  monthlyExpensesToday: v.number(),        // base currency, "today's money"

  // housing / real estate
  ownsPrimaryResidence: v.boolean(),
  primaryResidenceExcluded: v.boolean(),   // always true when owned; stored for clarity
  fundableRealEstateEquity: v.optional(v.number()), // sellable property to count in portfolio

  // pensions (flexible list)
  pensionSources: v.array(v.object({
    label: v.string(),                     // "State pension", "Company pension", ...
    monthlyAmount: v.number(),
  })),

  // assumptions (defaults applied if absent)
  inflationRate: v.number(),               // default 0.02
  withdrawalRate: v.number(),              // default 0.04
  optimisticReturn: v.number(),            // default 0.075
  conservativeReturn: v.number(),          // default 0.05

  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_user", ["userId"]),
```

### 4.2 TS types — `frontend/lib/types/retirement.ts`
- [x] `enum RetirementStep { INTRO=1, PERSONAL, EXPENSES, HOUSING, PENSIONS, PORTFOLIO, ASSUMPTIONS, RESULTS }`
- [x] `RetirementInputs` (mirrors plan fields, no userId/timestamps) — defined in the pure service, re-exported here
- [x] `PensionSource { label: string; monthlyAmount: number }`
- [x] `RetirementResults` (everything computed in §1, both scenarios) — shared with `retirementService.ts`
- [x] Default constants: `DEFAULT_INFLATION=0.02`, `DEFAULT_WITHDRAWAL=0.04`, **`DEFAULT_OPTIMISTIC=0.0718`**, `DEFAULT_CONSERVATIVE=0.05` (+ `DEFAULT_RETIREMENT_INPUTS`, `RETIREMENT_STEP_LABELS`)

---

## 5. Finance helpers — `services/finance/retirementService.ts` (NEW, pure)

Framework-free so both the client (live preview) and Convex (persisted dashboard query) import the same logic.

- [x] `inflateToFuture(amountToday, inflationRate, years): number`
      → `calculateEndCapitalValueWithCompoundInterest(amountToday, inflationRate, years)`
- [x] `portfolioTargetFromAnnualGap(annualGap, withdrawalRate=0.04): number`
      → `annualGap / withdrawalRate`
- [x] `requiredMonthlyContribution(currentFundable, targetPortfolio, years, annualReturn): number`
      - `projected = end(currentFundable, r, years)`
      - `gap = max(0, target − projected)`
      - `annualContribution = calculateAnnuityPayment(PV(gap, r, years), r, years)` *(sinking-fund: future value of the annuity equals `gap`)*
      - return `annualContribution / 12`
      - **Round-trip unit test added** ✔
- [x] `yearsToReachTarget(...)` — implemented as **`yearsToTargetWithoutSaving(currentFundable, target, r)`** (the no-contribution variant, surfaced per-scenario as `ageReachTargetWithoutSaving`). The plan's required-contribution case is exact-by-construction (reaches target at retirement), so the general with-contribution solve wasn't needed.
- [x] `computeRetirementResults(inputs, netWorth): RetirementResults`
      - orchestrates §1 for **both** optimistic & conservative `r`
      - returns `expenseTodayMonthly, expenseFutureMonthly, pensionMonthly, gapMonthly, gapAnnual, targetPortfolio, simpleTargetPortfolio, fundableNow, presentValueOfTarget, progressPct, pensionsCoverAll, { optimistic, conservative }`
      - each scenario: `{ projectedFromCurrent, remainingGap, monthlyContribution, onTrack, yearsToTargetWithoutSaving, ageReachTargetWithoutSaving, projectionSeries }`
      - `projectionSeries`: `{ yearOffset, age, portfolioValue, portfolioValueNoContrib, targetPortfolio }`
- [x] **Tests** — `services/finance/retirementService.test.ts` (vitest), 19 tests incl. the worked example, round-trip, and edge cases.

### Worked example to lock in as a test
Retire in 5 years, want €4,000/mo (today's money), €2,000/mo from pensions.
- expenseFuture (2% × 5y) ≈ €4,416/mo → gapMonthly ≈ €2,416 → gapAnnual ≈ €28,995
- targetPortfolio ≈ €724,878 (the README's simplified version ignores inflation → €2,000 gap → €600,000; show **both** the simple and the inflation-adjusted number in the explainer).

---

## 6. Convex backend — `frontend/convex/retirement.ts`

- [x] `getRetirementPlan` (query) — returns the user's plan or `null`. Auth via `getUserIdentity()`.
- [x] `saveRetirementPlan` (mutation) — upsert by `userId`; accepts partial inputs + `currentStep`; sets defaults for missing assumptions; validates ranges (age 0–120, non-negative money, rates 0–1).
- [x] `updateRetirementStep` (mutation) — lightweight step persistence between wizard screens.
- [x] `resetRetirementPlan` (mutation) — delete/reset to draft.
- [x] ~~`getRetirementResults` (query)~~ — **intentionally not a server query.** `services/` is outside Convex's project root, so results are composed **client-side** in `useRetirementResults` (plan + live `getTotalNetWorth` → `computeRetirementResults`). Equally reactive; keeps the math in one tested place.
- [x] Edge cases: validation lives server-side (`saveRetirementPlan`); the compute edge cases (no plan, zero net worth, pensions ≥ expenses, retirementAge ≤ currentAge, on-track) are handled in the pure service + surfaced in the UI.

---

## 7. Hooks — `frontend/hooks/convex/retirement.ts`

- [x] `useRetirementPlan()` → `useQuery(api.retirement.getRetirementPlan)`
- [x] `useRetirementResults()` — composes plan + `getTotalNetWorth` via `computeRetirementResults` (client-side, reactive)
- [x] `useSaveRetirementPlan()` → `useMutation(api.retirement.saveRetirementPlan)`
- [x] `useUpdateRetirementStep()`, `useResetRetirementPlan()`
- [x] Re-export from [`frontend/hooks/convex/index.ts`](../frontend/hooks/convex/index.ts)
- [x] `useRetirementPreview(inputs)` client-only hook for instant in-wizard previews (no round-trip)

---

## 8. Wizard UI — `organisms/retirement/`

Mirror `OnboardingFlow.tsx`: `currentStep` state, `direction` for framer-motion, `handleNext/handleBack/handleSkip`, persist on each advance via `useUpdateRetirementStep`.

- [x] `RetirementFlow.tsx` — master state machine + progress rail + step renderer; persists on advance; hydrates from saved plan; returns active plans straight to results.
- [x] `shared/RetirementStepShell.tsx` — card + title + nav buttons + animation (dashboard theme).
- [x] **IntroStep** — what this does + 4%-rule teaser. CTA "Get started".
- [x] **PersonalStep** — **date of birth** (derives & displays age, persists to `userSettings`) + target retirement age. Validates `retirementAge > age`; shows years to retirement.
- [x] **ExpensesStep** — monthly living expenses today + live "≈ €X/mo at retirement after inflation"; helper to exclude rent if they own.
- [x] **HousingStep** — *the edge-case step:*
  - "Do you own the home you live in?" (yes/no).
  - If **yes**: explain that the home is **not** counted toward the funding portfolio (you can't sell it and still live in it), but that owning it is *why* your monthly expenses are lower (no rent). Set `ownsPrimaryResidence=true`, `primaryResidenceExcluded=true`.
  - Optional: "Do you have property you'd sell/rent to fund retirement?" → `fundableRealEstateEquity` (added to portfolio base) or treat rental income as a pension source (link to PensionsStep).
  - Make double-counting impossible: net worth doesn't include property, so only what the user enters here counts.
- [x] **PensionsStep** (`PensionsStep.tsx`) — flexible add/remove list (`label` + `monthlyAmount`) with live sum.
- [x] **PortfolioStep** — shows current net worth (`getTotalNetWorth`) as the funding base plus `fundableRealEstateEquity`; read-only with the primary-residence-excluded note.
- [x] **AssumptionsStep** — editable defaults (**7.18%**/5% returns, 2% inflation, 4% withdrawal) with explanatory hints + "reset to defaults".
- [x] **ResultsStep** — renders the dashboard (§9) inline; "Save my plan" persists `status="active"`.

Forms: `useState` per step (match onboarding), shadcn `Input`/`Select`/`Slider`/`Button`, optional zod validation before advancing.

---

## 9. Results dashboard — `molecules/retirement/` + `/retirement` page

Shown at `/retirement` once a plan exists (edit re-enters the wizard).

- [x] **RetirementProgressCard** — exact target portfolio (full amount, not compact), years left, and a progress % with a clear plain-language explanation (current portfolio grown at the expected return ÷ target).
- [x] **PensionCoverageBreakdown** — stacked bar: future monthly expense split into pensions vs portfolio (uses real today's-expense figure).
- [x] **RequiredSavingsCard** — side-by-side **expected (7.18%)** vs **conservative (5%)** monthly contribution; on-track message when no saving needed.
- [x] **RetirementProjectionChart** (recharts `AreaChart`) — **4 paths** (expected/conservative × with/without monthly saving) + dashed target line. Uses `projectionSeries`.
- [x] **FourPercentRuleExplainer** — plain-language 7–8% − ~2% − buffer ≈ 4%; shows both the simple (€600k) and inflation-adjusted (~€725k) targets.
- [x] Empty/edge states: pensions cover expenses; already past target (on-track, no extra saving); invalid timeline (retirementAge ≤ currentAge → prompt to adjust); loading skeletons.

---

## 10. Routing & navigation

- [x] `app/(root)/retirement/page.tsx` (`"use client"`) renders `RetirementFlow`, which itself shows the wizard for a draft/new plan and the results dashboard for an active one. **No `layout.tsx`** — the parent `(root)/layout.tsx` already provides sidebar/auth chrome.
- [x] Nav item added in [`navigationSidebar.tsx`](../frontend/components/atomic/organisms/navigationSidebar.tsx) under `navigationTools`: `{ title: "Retirement Planner", url: "/retirement", icon: PiggyBank }`.
- [ ] (Optional) Teaser card / link from the dashboard or onboarding completion. *(not done — optional)*

---

## 11. i18n / copy

- [x] User-facing strings in **English**, surfaced as "Retirement Planner" at `/retirement`.
- [x] Copy is hardcoded English, consistent with the rest of the app's pages (no shared i18n string mechanism is in use for feature copy today).

---

## 12. Testing & verification

- [x] Unit-test `retirementService.ts` against the §5 worked example (both scenarios; round-trip contribution check). **19 tests, all green.**
- [x] Edge tests: pensions ≥ expenses; retirementAge ≤ currentAge; zero net worth; `fundableRealEstateEquity` included; 7.18% doubling; today's-expense passthrough; no-contribution path.
- [ ] Manual: complete the wizard end-to-end in the browser, reload (state persisted), edit plan, verify dashboard updates on portfolio change. **← outstanding (Phase 7)**
- [x] Typecheck clean (`npx tsc --noEmit` → 0 errors) + Biome clean on all new files. *(Note: `next lint` is removed in this Next version; Biome is the active linter.)*
- [~] `bunx convex codegen` succeeds and registers the new functions/schema. A full `convex dev`/deploy to push the `retirementPlans` table + `setBirthDate`/`birthDate` to a live deployment is **still pending**.

---

## 13. Suggested build order (phases)

1. ✅ **Math first** — `retirementService.ts` + tests (§5).
2. ✅ **Data layer** — schema table (§4.1), `retirement.ts` queries/mutations (§6), hooks (§7).
3. ✅ **Wizard skeleton** — `RetirementFlow` + step shells + routing + nav (§8, §10), persisting state.
4. ✅ **Step content** — each step's form + live previews (§8).
5. ✅ **Results dashboard** — cards + chart + explainer (§9).
6. ✅ **Edge cases & polish** — empty states, validation, copy, housing edge cases, DOB capture, full-width layout.
7. ⏳ **Test & verify** (§12) — automated tests + typecheck/lint done; **manual browser walkthrough + live Convex deploy outstanding.**

---

## 14. Open / future (explicitly out of scope for v1)

- Multiple saved scenarios / comparison (schema is single-plan now; additive later).
- User-selectable asset categories for the funding base (v1 = total net worth − primary residence).
- Monte-carlo / sequence-of-returns risk modeling (v1 uses deterministic 7.5% & 5%).
- Tax treatment of withdrawals & pension taxation.
- Tracking real estate as a first-class net-worth asset (separate feature; would then require excluding primary residence in `getTotalNetWorth`).
