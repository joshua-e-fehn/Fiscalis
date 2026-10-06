# Retirement Planner ("Rentenplaner") — Implementation Plan

> A step-by-step, tickable plan for adding a retirement / pension planning feature to Fiscalis.
> The feature lets a user define when they want to retire and the lifestyle they want, then
> computes the portfolio they need (via the 4% rule), how far along they already are, and how
> much they must save each month — with plain-language explanations for non-experts.

---

## ✅ Implementation status (updated)

**Phases 1–6 complete**, plus a follow-up fix round from a code audit (pension basis, fresh age, validation, net-worth basis, edit mode, save errors — see deviations below). **Phase 7 is still open:** the manual browser walkthrough and the Convex deploy (the backend changes must reach the production deployment after review; until then the frontend keeps working against the currently deployed functions).

Notable deviations from the original plan (all intentional):
- **Default optimistic return is `0.0718` (7.18%), not 7.5%** — chosen so a portfolio doubles exactly every 10 years (`2^(1/10) − 1`). Conservative stays 5%.
- **No server-side `getRetirementResults` query.** The math is composed **client-side** in `useRetirementResults` (equally live via reactive `useQuery`), because the funding basis is the dashboard net worth, which is itself composed client-side (`usePortfolioOverview`). Convex persists the plan and validates it with the same pure service: `convex/retirement.ts` imports defaults and validators from `services/finance/retirementService.ts` by relative path (`../../services/...`; the `@/` alias is not configured for Convex).
- **Age comes from date of birth and is always derived fresh.** `userSettings.birthDate` (collected in onboarding ProfileStep and the wizard's PersonalStep) is canonical. Everywhere results are computed (wizard, dashboard, teaser) the age is `currentAgeForPlan`: profile date of birth → `plan.birthDate` snapshot → stored `plan.currentAge` as last fallback.
- **Pensions are entered in today's money** (like expenses; a German *Renteninformation* quotes roughly today's value) and inflated to the retirement date before being subtracted. Results expose `pensionTodayMonthly` and `pensionFutureMonthly`.
- **Funding basis = the dashboard net worth** (`useRetirementNetWorth`, built on `usePortfolioOverview("eur")`), not `getTotalNetWorth`. It includes vault metals, collectibles and manual loans, so the planner and the dashboard always show the same number. See §1 for mortgages and negative net worth.
- **Validation is shared.** `validateRetirementInputs` / `validateRetirementAssumptions` / `validateRetirementAges` / `validatePensionSources` (service) block the wizard inline and are re-run by `saveRetirementPlan` on the merged plan (`firstRetirementInputError`: every field when the save activates the plan (`status: "active"`); otherwise only the fields being saved (the retirement-after-current-age rule applies once the plan is active), so a value stored under older rules can't strand a draft). A complete plan also needs expenses above zero and, in the wizard, a valid date of birth. `retirementPlanProblem` decides when the plan page and the dashboard teaser show "Check your …" instead of results; dates of birth use `validateBirthDate` (`lib/utils/date.ts`) in the wizard, onboarding and the Convex mutations `saveUserSettings` and `setBirthDate` (`saveRetirementPlan` also uses it, but drops an invalid snapshot instead of throwing).
- **Editing an active plan does not autosave.** Changes stay local until "Save my plan"; "Discard changes" returns to the dashboard. Drafts still autosave on each Continue (only the fields confirmed so far). Save failures are shown inline (the app has no toast library) and "Saved" only appears after a successful save.
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
| Portfolio basis | **Total net worth by default** — the dashboard figure (`usePortfolioOverview`), **with explicit real-estate handling** |
| Real estate | Owner-occupied home is **excluded** from the 4%-rule portfolio; its benefit is the **lower monthly expenses** (no rent). Net worth does not track property today, so a dedicated housing step captures it. |

---

## 1. The calculation model (single source of truth)

All money is in the user's base currency (EUR). `n = retirementAge − currentAge` (years to retirement).

```
1.  expenseFuture   = monthlyExpensesToday × (1 + inflation)^n          // future € at retirement
2.  pensionFuture   = Σ max(0, pensionSources[i].monthlyAmount) × (1 + inflation)^n   // entered in today's money
3.  gapMonthly      = max(0, expenseFuture − pensionFuture)             // portfolio must fund this
4.  gapAnnual       = gapMonthly × 12
5.  targetPortfolio = gapAnnual / withdrawalRate                       // 4% rule ⇒ × 25
6.  fundableNow     = netWorth (dashboard figure) + fundableRealEstateEquity   // may be negative
    investableNow   = max(0, fundableNow)                              // debt is never compounded
7.  projectedFromCurrent = investableNow × (1 + r)^n                   // current assets grow on their own
8.  remainingGap    = max(0, targetPortfolio − projectedFromCurrent)
9.  monthlyContribution(r) = required savings whose future value = remainingGap   // see §5 helper
10. progressPct     = investableNow / PV(targetPortfolio, r, n)        // how close today
                      (1 when target = 0, i.e. pensions cover everything; 0 when the target is infinite)
11. ageReachTargetWithoutSaving = currentAge + yearsToTargetWithoutSaving(investableNow, targetPortfolio, r)   // no-contribution variant; see §5
```

- **Same basis everywhere:** the explainer's simplified target is `(expensesToday − pensionsToday) × 12 / withdrawalRate`, so `targetPortfolio = simpleTargetPortfolio × (1 + inflation)^n` exactly.
- **Negative net worth** (`hasNetDebt`): projections grow from `investableNow = 0`, progress is 0, and the UI shows a "liabilities exceed assets" message; paying down the debt comes on top of the computed savings.
- **Mortgages:** the funding basis equals the dashboard net worth, so a mortgage stays subtracted even when it finances the excluded primary residence (the home itself is never counted). PortfolioStep notes that all tracked loans (linked and manual) reduce the basis, including a mortgage on the home. `fundableRealEstateEquity` is sellable property value net of loans *not* tracked in Fiscalis, so a tracked loan is never subtracted twice.

Run steps 7–11 for **two return assumptions**:
- **Optimistic** `r = 7.18%` (doubles ~every 10 years: `2^(1/10) − 1`) — *implemented as `0.0718`*
- **Conservative** `r = 5%`

### Why this is internally consistent (put this in the UI explainer)
- **Pre-retirement:** we inflate the expense target and the pensions (2%/yr) and grow assets in **nominal** terms (7.18% / 5%).
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

**Portfolio value** — [`frontend/hooks/convex/portfolio.ts`](../frontend/hooks/convex/portfolio.ts):
- ✅ `usePortfolioOverview(currency)` → `{ totalAssets, totalLiabilities, netWorth, … }` — the dashboard's net worth (all categories incl. vault metals and collectibles, minus linked and manual liabilities). The planner reuses it via `useRetirementNetWorth`.
- ⚠️ [`frontend/convex/portfolio.ts`](../frontend/convex/portfolio.ts) `getTotalNetWorth()` covers only Plaid, SnapTrade and Bitpanda (no vault, no manual loans) — originally planned as the basis, replaced so the planner matches the dashboard.
- ✅ Auth pattern: `const identity = await ctx.auth.getUserIdentity(); const userId = identity.subject;`

**Wizard pattern to mirror** — onboarding:
- [`frontend/components/atomic/organisms/onboarding/OnboardingFlow.tsx`](../frontend/components/atomic/organisms/onboarding/OnboardingFlow.tsx) (enum steps, master state machine, framer-motion direction)
- [`frontend/components/atomic/organisms/onboarding/steps/`](../frontend/components/atomic/organisms/onboarding/steps/) (per-step components, `useState` forms)
- [`frontend/convex/onboarding.ts`](../frontend/convex/onboarding.ts) + [`frontend/hooks/convex/onboarding.ts`](../frontend/hooks/convex/onboarding.ts) (persisted progress)

**UI kit:** shadcn (`@/components/ui/shadcn/*`), `lucide-react` icons, **recharts** for charts, Tailwind dark-theme classes (`bg-white/[0.03] border-white/[0.1]`), zod available.

**Key finding:** No physical-property table exists (the dashboard's "real estate" category is listed REIT/fund positions) → net worth excludes the home → **no double-counting**. The wizard's housing step is the single place physical property enters the model.

---

## 3. Architecture overview

```
services/finance/
  retirementService.ts        ← NEW: pure, framework-free retirement math (client + convex import it)

frontend/convex/
  schema.ts                   ← EDIT: add `retirementPlans` table
  retirement.ts               ← NEW: get/save/reset plan (validated with the service; results are composed client-side)

frontend/hooks/convex/
  retirement.ts               ← NEW: useRetirementPlan, useSaveRetirementPlan, useRetirementResults
  index.ts                    ← EDIT: re-export

frontend/lib/types/
  retirement.ts               ← NEW: RetirementStep enum, input/result TS types

frontend/app/(root)/retirement/
  page.tsx                    ← NEW: dashboard if plan exists, else launch wizard

frontend/components/atomic/organisms/retirement/
  RetirementFlow.tsx          ← NEW: dashboard vs wizard switch (edit mode)
  RetirementWizard.tsx        ← NEW: wizard state machine (mirrors OnboardingFlow)
  steps/
    IntroStep.tsx
    PersonalStep.tsx          (current age / birthdate, retirement age)
    ExpensesStep.tsx          (monthly living expenses today + inflation preview)
    HousingStep.tsx           (own home? fundable property equity? edge cases)
    PensionsStep.tsx          (flexible list of monthly incomes)
    PortfolioStep.tsx         (shows net worth basis, adjustments)
    AssumptionsStep.tsx       (advanced: returns/inflation/withdrawal — sensible defaults)
    ResultsStep.tsx           (target, progress, required savings, charts, explainer)
  shared/
    RetirementStepShell.tsx   (reused card/nav wrapper)

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
  optimisticReturn: v.number(),            // default 0.0718
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

Framework-free so both the client (live preview, dashboard) and Convex (defaults + validation in `saveRetirementPlan`) import the same logic.

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
      - returns `expenseTodayMonthly, expenseFutureMonthly, pensionTodayMonthly, pensionFutureMonthly, gapMonthly, gapAnnual, targetPortfolio, simpleTargetPortfolio, fundableNow, investableNow, hasNetDebt, presentValueOfTarget, progressPct, pensionsCoverAll, { optimistic, conservative }`
      - each scenario: `{ projectedFromCurrent, remainingGap, monthlyContribution, onTrack, yearsToTargetWithoutSaving, ageReachTargetWithoutSaving, projectionSeries }`
      - `projectionSeries`: `{ yearOffset, age, portfolioValue, portfolioValueNoContrib, targetPortfolio }`
- [x] Validators shared by the wizard and Convex: `validateRetirementInputs(inputs, { requireValidTimeline })`, `validateRetirementAssumptions` (withdrawal rate > 0 and ≤ 20%, other rates 0–20%, conservative ≤ expected, NaN/∞ rejected), `validateRetirementAges` (whole numbers 0–120; retirement after current age unless disabled for drafts), `validatePensionSources` (amounts ≥ 0).
- [x] **Tests** — `services/finance/retirementService.test.ts` (vitest), covering the worked example, round-trip, edge cases (zero/negative net worth, 0% withdrawal rate, pensions covering everything) and validation.

### Worked example to lock in as a test
Retire in 5 years, want €4,000/mo (today's money), €2,000/mo from pensions (today's money).
- expenseFuture (2% × 5y) ≈ €4,416/mo, pensionFuture ≈ €2,208/mo → gapMonthly ≈ €2,208 → gapAnnual ≈ €26,498
- targetPortfolio ≈ €662,448 (the simplified version ignores inflation → €2,000 gap → €600,000; €600,000 × 1.02⁵ ≈ €662,448, so the explainer shows **both** numbers on the same basis).

---

## 6. Convex backend — `frontend/convex/retirement.ts`

- [x] `getRetirementPlan` (query) — returns the user's plan or `null`. Auth via `getUserIdentity()`.
- [x] `saveRetirementPlan` (mutation) — upsert by `userId`; accepts partial inputs + `currentStep`; merges them over the existing plan (or the create defaults) and runs `validateRetirementInputs` on the result. The retirement-after-current-age check applies only when the plan ends up `active`. `currentStep` must be 1–8; an invalid `birthDate` snapshot is dropped (the profile is canonical).
- [x] `updateRetirementStep` (mutation) — lightweight step persistence between wizard screens (step 1–8). Currently unused by the UI.
- [x] `resetRetirementPlan` (mutation) — delete/reset to draft.
- [x] ~~`getRetirementResults` (query)~~ — **intentionally not a server query.** Results are composed **client-side** in `useRetirementResults` (plan + profile date of birth + dashboard net worth → `computeRetirementResults`), because the dashboard net worth is itself a client-side composition. Equally reactive; keeps the math in one tested place.
- [x] Edge cases: validation runs in the wizard (inline, blocking) and again server-side (`saveRetirementPlan`); the compute edge cases (no plan, zero/negative net worth, pensions ≥ expenses, retirementAge ≤ currentAge, 0% withdrawal rate, on-track) are handled in the pure service + surfaced in the UI.
- [x] Onboarding: `saveUserSettings` and `setBirthDate` share `assertValidBirthDate` (built on `validateBirthDate`); ProfileStep shows the same error inline before saving.

---

## 7. Hooks — `frontend/hooks/convex/retirement.ts`

- [x] `useRetirementPlan()` → `useQuery(api.retirement.getRetirementPlan)`
- [x] `useRetirementResults()` — composes plan + profile date of birth + `useRetirementNetWorth()` via `computeRetirementResults` (client-side, reactive; age from `currentAgeForPlan`)
- [x] `useRetirementNetWorth()` — dashboard net worth (`usePortfolioOverview("eur")`) plus `totalAssets`, `totalLiabilities`
- [x] `planToInputs(plan, profileBirthDate)` / `currentAgeForPlan(...)` — shared by the hooks and the wizard
- [x] `useSaveRetirementPlan()` → `useMutation(api.retirement.saveRetirementPlan)`
- [x] `useUpdateRetirementStep()`, `useResetRetirementPlan()`
- [x] Re-export from [`frontend/hooks/convex/index.ts`](../frontend/hooks/convex/index.ts)
- [x] `useRetirementPreview(inputs)` client-only hook for instant in-wizard previews (no round-trip)

---

## 8. Wizard UI — `organisms/retirement/`

Mirror `OnboardingFlow.tsx`: `currentStep` state, `direction` for framer-motion, `handleNext/handleBack`. Drafts persist the confirmed fields on each Continue; edits to an active plan persist only on Save.

- [x] `RetirementFlow.tsx` — picks the dashboard (active plan) or the wizard (new plan, draft, or editing). Leaving edit mode unmounts the wizard, which discards unsaved edits.
- [x] `RetirementWizard.tsx` — state machine + progress rail (steps up to the furthest one reached are clickable) + direction-aware step transitions; hydrates once from the saved plan and the profile date of birth.
  - **Draft:** each Continue validates and saves the fields confirmed so far (plus the date of birth to the profile) and only advances on success.
  - **Editing an active plan:** nothing is written until "Save my plan"; a "Discard changes" bar returns to the dashboard.
  - Save failures are shown inline below the step; "Saved" only appears after a successful save.
- [x] `shared/RetirementStepShell.tsx` — card + title + nav buttons (dashboard theme); step transitions are animated by `RetirementWizard`.
- [x] **IntroStep** — what this does + 4%-rule teaser. CTA "Get started".
- [x] **PersonalStep** — **date of birth** (derives & displays age; saved to `userSettings` together with the plan) + target retirement age (whole years). Validates the date and `retirementAge > age` inline; shows years to retirement.
- [x] **ExpensesStep** — monthly living expenses today + live "≈ €X/mo at retirement after inflation"; helper to exclude rent if they own.
- [x] **HousingStep** — *the edge-case step:*
  - "Do you own the home you live in?" (yes/no).
  - If **yes**: explain that the home is **not** counted toward the funding portfolio (you can't sell it and still live in it), but that owning it is *why* your monthly expenses are lower (no rent). Set `ownsPrimaryResidence=true`, `primaryResidenceExcluded=true`.
  - Optional: "Do you have property you'd sell/rent to fund retirement?" → `fundableRealEstateEquity` (added to portfolio base) or treat rental income as a pension source (link to PensionsStep).
  - Make double-counting impossible: net worth doesn't include property, so only what the user enters here counts.
  - *Not built:* the "rental income as a pension source" path (see Known limitations).
- [x] **PensionsStep** (`PensionsStep.tsx`) — flexible add/remove list (`label` + `monthlyAmount` in **today's money**, e.g. from the Renteninformation) with live sum; negative amounts are blocked.
- [x] **PortfolioStep** — shows the dashboard net worth (`useRetirementNetWorth`) as the funding base plus `fundableRealEstateEquity`; read-only, with notes for a negative basis and for tracked loans (incl. a home mortgage).
- [x] **AssumptionsStep** — editable defaults (**7.18%**/5% returns, 2% inflation, 4% withdrawal) with explanatory hints + "reset to defaults"; invalid rates are shown inline and block "See my plan".
- [x] **ResultsStep** — renders the dashboard (§9) inline; "Save my plan" persists `status="active"`.

Forms: `useState` per step (match onboarding), shadcn `Input`/`Select`/`Slider`/`Button`; validation before advancing uses the service validators (no zod).

---

## 9. Results dashboard — `molecules/retirement/` + `/retirement` page

Shown at `/retirement` once a plan exists (edit re-enters the wizard).

- [x] **RetirementProgressCard** — exact target portfolio (full amount, not compact), years left, and a progress % with a clear plain-language explanation (current portfolio grown at the expected return ÷ target).
- [x] **PensionCoverageBreakdown** — stacked bar: future monthly expense split into (inflated) pensions vs portfolio; states both today's and future pension amounts.
- [x] **RequiredSavingsCard** — side-by-side **expected (7.18%)** vs **conservative (5%)** monthly contribution, with the doubling time computed from the user's return; on-track / pensions-cover-everything message when no saving is needed.
- [x] **RetirementProjectionChart** (recharts `AreaChart`) — **4 paths** (expected/conservative × with/without monthly saving) + dashed target line. Uses `projectionSeries`.
- [x] **FourPercentRuleExplainer** — plain-language 7–8% − ~2% − buffer ≈ 4%, personalised with the plan's withdrawal and inflation rates; shows both the simple (€600k) and inflation-adjusted (~€662k) targets on the same basis.
- [x] Empty/edge states: pensions cover expenses; already past target (on-track, no extra saving); negative net worth (debt message, 0% progress); invalid timeline or assumptions (prompt to go back, or to "Edit plan" on the dashboard); loading skeletons.
- [x] Compact amounts (chart axis, explainer, teaser) use `formatCurrency(…, { compact: true })`, which keeps decimals ("€1.46M", "€400K").

---

## 10. Routing & navigation

- [x] `app/(root)/retirement/page.tsx` (`"use client"`) renders `RetirementFlow`, which itself shows the wizard for a draft/new plan and the results dashboard for an active one. **No `layout.tsx`** — the parent `(root)/layout.tsx` already provides sidebar/auth chrome.
- [x] Nav item added in [`navigationSidebar.tsx`](../frontend/components/atomic/organisms/navigationSidebar.tsx) under `navigationTools`: `{ title: "Retirement Planner", url: "/retirement", icon: PiggyBank }`.
- [x] (Optional) Teaser card on the dashboard — `RetirementTeaserCard` (no plan / draft / active states) in `app/(root)/dashboard/page.tsx`.

---

## 11. i18n / copy

- [x] User-facing strings in **English**, surfaced as "Retirement Planner" at `/retirement`.
- [x] Copy is hardcoded English, consistent with the rest of the app's pages (no shared i18n string mechanism is in use for feature copy today).

---

## 12. Testing & verification

- [x] Unit-test `retirementService.ts` against the §5 worked example (both scenarios; round-trip contribution check). **All green.**
- [x] Edge tests: pensions ≥ expenses (100% progress at any net worth); retirementAge ≤ currentAge; zero and negative net worth; 0% withdrawal rate; progress above 100%; `fundableRealEstateEquity` included; negative pension amounts; 7.18% doubling; today's-expense passthrough; no-contribution path; input validation.
- [ ] Manual: complete the wizard end-to-end in the browser, reload (draft persisted), edit an active plan (Save and Discard), verify dashboard + teaser update on portfolio change. **← outstanding (Phase 7)**
- [x] Typecheck clean (`npx tsc --noEmit` → 0 errors). *No linter is configured:* there is no Biome config or binary in the repo, and `bun run lint` (`next lint`) no longer exists in Next 16; `.eslintrc.json` is unused.
- [~] `bunx convex codegen` succeeds. This round's backend changes (shared validation in `saveRetirementPlan` / `updateRetirementStep` (step range) / `saveUserSettings` / `setBirthDate`; `saveUserSettings` now rejects an invalid `birthDate`) are deployed to production after review; until then the frontend keeps working against the currently deployed functions (no new functions or args).

---

## 13. Suggested build order (phases)

1. ✅ **Math first** — `retirementService.ts` + tests (§5).
2. ✅ **Data layer** — schema table (§4.1), `retirement.ts` queries/mutations (§6), hooks (§7).
3. ✅ **Wizard skeleton** — `RetirementFlow` + step shells + routing + nav (§8, §10), persisting state.
4. ✅ **Step content** — each step's form + live previews (§8).
5. ✅ **Results dashboard** — cards + chart + explainer (§9).
6. ✅ **Edge cases & polish** — empty states, validation, copy, housing edge cases, DOB capture, full-width layout.
7. ⏳ **Test & verify** (§12) — automated tests + typecheck done (no linter configured); **manual browser walkthrough + Convex deploy outstanding.**

---

## 14. Known limitations / later (explicitly out of scope for v1)

- **Pension bridge for early retirement.** Pensions are assumed to start on the retirement date; retiring before the statutory pension age needs a bridge period funded by the portfolio, which the model doesn't add.
- **Monthly contribution compounding.** The "monthly" saving is an end-of-year annual sinking-fund payment ÷ 12, slightly overstating the needed amount compared with true monthly compounding.
- **Fractional horizon.** Years to retirement use the whole-year age from the date of birth, so the horizon can be up to ~1 year too long.
- **Rental income as a pension source.** HousingStep only offers sellable equity; a kept rental's net rent has to be added manually as a pension row (no dedicated hint or button yet).
- **Mortgage on the primary residence** stays subtracted from the funding basis (it matches the dashboard; see §1). Loans can't be told apart from mortgages, so none are added back.
- **Multiple saved scenarios** / comparison (schema is single-plan now; additive later).
- **Monte Carlo** / sequence-of-returns risk modelling (v1 uses deterministic 7.18% & 5%).
- **Taxes** on withdrawals and pensions.
- User-selectable asset categories for the funding base (v1 = dashboard net worth; the primary residence is never in it).
- Tracking physical real estate as a first-class net-worth asset (separate feature; would then require excluding the primary residence from the funding basis).
- No UI to reset/start over (`resetRetirementPlan` exists but is unused), and `ageReachTargetWithoutSaving` is computed but not displayed.
