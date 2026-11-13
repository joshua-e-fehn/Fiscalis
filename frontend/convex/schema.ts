import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
	DAY_COUNT_CONVENTIONS,
	LOAN_PAYMENT_FREQUENCIES,
	LOAN_PAYMENT_TYPES,
	LOAN_STATUSES,
	LOAN_TYPES,
	PREPAYMENT_EFFECTS,
} from "../../services/finance/loanScheduleService";

// Loan enums are declared once in the loan engine; these validators derive
// from the same const arrays
const oneOf = <T extends string>(values: readonly T[]) =>
	v.union(...values.map((value) => v.literal(value)));
export const loanTypeValidator = oneOf(LOAN_TYPES);
export const loanPaymentFrequencyValidator = oneOf(LOAN_PAYMENT_FREQUENCIES);
export const loanStatusValidator = oneOf(LOAN_STATUSES);
export const loanPaymentTypeValidator = oneOf(LOAN_PAYMENT_TYPES);
export const prepaymentEffectValidator = oneOf(PREPAYMENT_EFFECTS);
export const dayCountValidator = oneOf(DAY_COUNT_CONVENTIONS);

/** Retirement plan: how a funding category grows (FundingTreatment in retirementService). */
export const retirementFundingTreatmentValidator = v.union(
	v.literal("growth"),
	v.literal("moderate"),
	v.literal("inflation"),
	v.literal("exclude"),
);

/** Retirement plan: one pension source (PensionSource in retirementService). */
export const retirementPensionSourceValidator = v.object({
	label: v.string(),
	monthlyAmount: v.number(),
	// Absent = gross (the plan's deduction rate is taken off).
	gross: v.optional(v.boolean()),
	// Absent = indexed to inflation until retirement.
	indexed: v.optional(v.boolean()),
});

export default defineSchema({
	// ═══════════════════════════════════════════════════════════════
	// BANKING (Plaid)
	// ═══════════════════════════════════════════════════════════════

	plaidItems: defineTable({
		userId: v.string(), // Clerk user ID
		accessToken: v.string(), // Encrypted with AES-256-GCM
		itemId: v.string(), // Plaid item ID
		institutionId: v.optional(v.string()),
		institutionName: v.optional(v.string()),
		institutionLogo: v.optional(v.string()), // Base64-encoded PNG from Plaid
		institutionPrimaryColor: v.optional(v.string()), // Hex color code from Plaid (e.g., "#004966")
		status: v.union(
			v.literal("active"),
			v.literal("error"),
			v.literal("pending_reauth"),
		),
		errorCode: v.optional(v.string()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_item", ["itemId"]),

	plaidAccounts: defineTable({
		userId: v.string(),
		itemId: v.string(), // Reference to plaidItems.itemId
		accountId: v.string(), // Plaid account ID
		name: v.string(),
		officialName: v.optional(v.string()),
		type: v.string(), // checking, savings, credit, investment, etc.
		subtype: v.optional(v.string()),
		mask: v.optional(v.string()), // Last 4 digits
		currentBalance: v.optional(v.number()),
		availableBalance: v.optional(v.number()),
		currency: v.string(),
		lastSynced: v.number(),
		// Classification fields
		investmentCategory: v.optional(v.string()), // "cash", "liabilities", etc.
		investmentSubcategory: v.optional(v.string()), // "checking-accounts", "credit-cards", etc.
		classificationSource: v.optional(v.string()), // "auto", "user_override", "admin"
		classificationRule: v.optional(v.string()), // Rule ID that matched
		userCategoryOverride: v.optional(v.string()), // User's manual category override
		userSubcategoryOverride: v.optional(v.string()), // User's manual subcategory override
		// Currency conversion fields, stamped at sync time
		// (services/finance/currency.ts bankAccountBaseFields)
		valueInBaseCurrency: v.optional(v.number()), // Balance in EUR; absent when the currency has no rate
		exchangeRateUsed: v.optional(v.number()), // EUR per unit at sync time
		exchangeRateTimestamp: v.optional(v.number()), // DEPRECATED - no longer written
		exchangeRateDate: v.optional(v.string()), // Day of the rate (YYYY-MM-DD); absent for identity/fallback
		exchangeRateSource: v.optional(
			v.union(
				v.literal("identity"),
				v.literal("market"),
				v.literal("stale"),
				v.literal("fallback"),
				v.literal("unknown"),
			),
		), // "stale": mirrored rate older than 7 days; "unknown": currency missing or without a rate
		baseCurrency: v.optional(v.string()), // "EUR"
	})
		.index("by_user", ["userId"])
		.index("by_item", ["itemId"])
		.index("by_account", ["accountId"])
		.index("by_category", ["userId", "investmentCategory"])
		.index("by_subcategory", [
			"userId",
			"investmentCategory",
			"investmentSubcategory",
		]),

	plaidTransactions: defineTable({
		userId: v.string(),
		accountId: v.string(),
		plaidTransactionId: v.string(),
		amount: v.number(),
		date: v.string(), // ISO date string (YYYY-MM-DD)
		name: v.string(),
		merchantName: v.optional(v.string()),
		category: v.optional(v.string()),
		pending: v.boolean(),
		syncedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_account", ["accountId"])
		.index("by_date", ["userId", "date"])
		.index("by_plaid_id", ["plaidTransactionId"]),

	// ═══════════════════════════════════════════════════════════════
	// BROKERS (SnapTrade)
	// ═══════════════════════════════════════════════════════════════

	// SnapTrade user registration (one per Fiscalis user)
	// SnapTrade requires registering users on their platform first
	snaptradeUsers: defineTable({
		userId: v.string(), // Clerk user ID
		snaptradeUserId: v.string(), // SnapTrade's user identifier
		snaptradeUserSecret: v.string(), // Encrypted user secret
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_snaptrade_user", ["snaptradeUserId"]),

	// Broker connections (one per connected brokerage)
	brokerConnections: defineTable({
		userId: v.string(), // Clerk user ID
		snaptradeUserId: v.string(), // Reference to snaptradeUsers
		authorizationId: v.string(), // SnapTrade's connection/authorization ID
		brokerName: v.string(), // e.g., "Interactive Brokers", "Fidelity"
		brokerSlug: v.string(), // e.g., "INTERACTIVE_BROKERS", "FIDELITY"
		brokerLogo: v.optional(v.string()), // URL to broker logo
		status: v.union(
			v.literal("connected"),
			v.literal("error"),
			v.literal("reauth_required"),
			v.literal("syncing"),
			v.literal("disconnected"),
		),
		errorMessage: v.optional(v.string()),
		lastSyncAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_authorization", ["authorizationId"])
		.index("by_status", ["userId", "status"]),

	// Brokerage accounts (multiple per connection)
	brokerAccounts: defineTable({
		userId: v.string(), // Clerk user ID
		connectionId: v.id("brokerConnections"), // Reference to connection
		snaptradeAccountId: v.string(), // SnapTrade's account identifier
		name: v.string(), // Account name
		accountNumber: v.optional(v.string()), // Masked account number
		accountType: v.string(), // "MARGIN", "CASH", "TFSA", "RRSP", "401K", etc.
		balance: v.optional(v.number()), // Total account value
		cash: v.optional(v.number()), // Available cash
		currency: v.string(), // Account currency
		institutionName: v.optional(v.string()), // Broker name (denormalized)
		lastSyncAt: v.optional(v.number()),
		createdAt: v.number(),
		// Cash classification fields (for uninvested cash tracking)
		cashInvestmentCategory: v.optional(v.string()), // "cash" or "liabilities" (if margin)
		cashInvestmentSubcategory: v.optional(v.string()), // "broker-cash" or "margin-loans"
		// "reported" broker cash, or "residual" = total minus positions
		// (services/brokers/snaptradePosition.ts snaptradeAccountFields)
		cashSource: v.optional(v.union(v.literal("reported"), v.literal("residual"))),
		// Base-currency fields, stamped at sync time
		// (services/finance/currency.ts brokerAccountBaseFields)
		balanceCurrency: v.optional(v.string()), // Currency of balance/cash when the API reports one; else `currency`
		balanceInBaseCurrency: v.optional(v.number()), // Balance in EUR
		// The balance sums holdings with no rate into balanceCurrency, so it has
		// no EUR value; kept so a re-stamp (backfill) does not invent one
		balanceIsMixed: v.optional(v.boolean()),
		cashValueInBaseCurrency: v.optional(v.number()), // Cash value in EUR
		cashExchangeRateUsed: v.optional(v.number()), // EUR per unit at sync time
		exchangeRateDate: v.optional(v.string()), // Day of the rate (YYYY-MM-DD)
		exchangeRateSource: v.optional(
			v.union(
				v.literal("identity"),
				v.literal("market"),
				v.literal("stale"),
				v.literal("fallback"),
				v.literal("unknown"),
			),
		),
	})
		.index("by_user", ["userId"])
		.index("by_connection", ["connectionId"])
		.index("by_snaptrade_account", ["snaptradeAccountId"]),

	// Positions/Holdings
	brokerPositions: defineTable({
		userId: v.string(), // Clerk user ID
		accountId: v.id("brokerAccounts"), // Reference to account
		snaptradePositionId: v.optional(v.string()), // SnapTrade's position ID if available
		symbol: v.string(), // Ticker symbol
		symbolId: v.optional(v.string()), // SnapTrade's universal symbol ID
		name: v.optional(v.string()), // Security name
		assetType: v.string(), // "equity", "etf", "option", "bond", "mutual_fund", "cryptocurrency", "forex", "futures", "precious_metal", "other" (services/brokers/snaptradePosition.ts)
		quantity: v.number(), // Number of shares/units
		averageCostBasis: v.optional(v.number()), // Average cost per share
		totalCostBasis: v.optional(v.number()), // Total cost basis
		currentPrice: v.optional(v.number()), // Current market price
		marketValue: v.optional(v.number()), // Current market value
		currency: v.string(), // Position currency
		// Identifiers
		isin: v.optional(v.string()), // International Securities Identification Number
		cusip: v.optional(v.string()), // Committee on Uniform Securities Identification Procedures
		figi: v.optional(v.string()), // Financial Instrument Global Identifier
		// P&L
		unrealizedPL: v.optional(v.number()), // Unrealized profit/loss
		unrealizedPLPercent: v.optional(v.number()), // Unrealized P&L percentage
		dayPL: v.optional(v.number()), // DEPRECATED - never written or read; kept so stored docs validate
		dayPLPercent: v.optional(v.number()), // DEPRECATED - never written or read; kept so stored docs validate
		// Classification fields
		investmentCategory: v.optional(v.string()), // "equities", "cash", "bonds", etc.
		investmentSubcategory: v.optional(v.string()), // "stocks", "etfs", "broker-cash", etc.
		classificationSource: v.optional(v.string()), // "auto", "user_override", "admin"
		classificationRule: v.optional(v.string()), // Rule ID that matched
		userCategoryOverride: v.optional(v.string()), // User's manual category override
		userSubcategoryOverride: v.optional(v.string()), // User's manual subcategory override
		// Currency conversion fields, stamped at sync time with one rate
		// (services/finance/currency.ts positionBaseFields)
		valueInBaseCurrency: v.optional(v.number()), // Market value in EUR
		costBasisInBaseCurrency: v.optional(v.number()), // Total cost basis in EUR
		unrealizedPLInBaseCurrency: v.optional(v.number()), // valueInBaseCurrency - costBasisInBaseCurrency
		exchangeRateUsed: v.optional(v.number()), // EUR per unit at sync time
		exchangeRateTimestamp: v.optional(v.number()), // DEPRECATED - no longer written
		exchangeRateDate: v.optional(v.string()), // Day of the rate (YYYY-MM-DD)
		exchangeRateSource: v.optional(
			v.union(
				v.literal("identity"),
				v.literal("market"),
				v.literal("stale"),
				v.literal("fallback"),
				v.literal("unknown"),
			),
		),
		baseCurrency: v.optional(v.string()), // "EUR"
		// Metadata
		lastSyncAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_account", ["accountId"])
		.index("by_symbol", ["userId", "symbol"])
		.index("by_category", ["userId", "investmentCategory"])
		.index("by_subcategory", [
			"userId",
			"investmentCategory",
			"investmentSubcategory",
		]),

	// Broker transactions/activities, synced from SnapTrade's account
	// activities (actions/snaptrade.ts syncAccountActivities); the snapshot
	// writer reads BUY/SELL rows as exact flows (services/portfolio/flows.ts)
	brokerTransactions: defineTable({
		userId: v.string(), // Clerk user ID
		accountId: v.id("brokerAccounts"), // Reference to account
		snaptradeActivityId: v.string(), // SnapTrade's activity/transaction ID
		type: v.string(), // "BUY", "SELL", "DIVIDEND", "INTEREST", "TRANSFER", "FEE", "CONTRIBUTION", "WITHDRAWAL", etc.
		symbol: v.optional(v.string()), // Ticker symbol (for trades)
		symbolId: v.optional(v.string()), // SnapTrade's universal symbol ID
		description: v.optional(v.string()), // Transaction description
		quantity: v.optional(v.number()), // Number of shares (for trades)
		price: v.optional(v.number()), // Price per share (for trades)
		amount: v.number(), // Total transaction amount
		currency: v.string(), // Transaction currency
		fees: v.optional(v.number()), // Transaction fees
		settlementDate: v.optional(v.string()), // Settlement date (ISO string)
		tradeDate: v.string(), // Trade/activity date (ISO string)
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_account", ["accountId"])
		// Newest activity per account: the start of an incremental fetch
		.index("by_account_date", ["accountId", "tradeDate"])
		.index("by_date", ["userId", "tradeDate"])
		.index("by_snaptrade_id", ["snaptradeActivityId"]),

	// ═══════════════════════════════════════════════════════════════
	// LOANS (Debt Management)
	// ═══════════════════════════════════════════════════════════════

	loans: defineTable({
		userId: v.string(), // Clerk user ID

		// Basic Loan Information
		name: v.string(), // User-friendly name (e.g., "Home Mortgage", "Car Loan")
		loanType: loanTypeValidator,

		// Financial Details
		originalPrincipal: v.number(), // Original loan amount
		currentBalance: v.number(), // Current outstanding balance (derived, see balanceAdjustment)
		// Manual balance edits on top of the recorded payments:
		// currentBalance = originalPrincipal - Σ principal repaid + balanceAdjustment
		// (deriveLoanBalance). Unset until migrations:backfillLoanBalanceAdjustment.
		balanceAdjustment: v.optional(v.number()),
		annualInterestRate: v.number(), // Interest rate as decimal (e.g., 0.05 for 5%)
		currency: v.string(), // ISO currency code

		// Term & Schedule
		termMonths: v.number(), // Original loan term in months
		paymentFrequency: loanPaymentFrequencyValidator,
		scheduledPayment: v.number(), // Regular payment amount (INTEREST_ONLY_THEN: the post-grace payment)
		// Interest accrual convention of each period; unset = flat periods
		// (rate / payments per year, as 30/360)
		dayCount: v.optional(dayCountValidator),

		// Dates
		startDate: v.string(), // Loan start date (ISO)
		expectedEndDate: v.string(), // Original expected end date (ISO)
		actualEndDate: v.optional(v.string()), // Actual end date if paid off
		nextPaymentDate: v.string(), // Next scheduled payment date

		// Interest-Only Specific
		gracePeriods: v.optional(v.number()), // For INTEREST_ONLY_THEN type

		// Prepayment Rules
		maxAnnualPrepaymentRate: v.optional(v.number()), // Max prepayment as % of principal
		prepaymentPenaltyRate: v.optional(v.number()), // Penalty rate for prepayment

		// Contract Details
		lender: v.optional(v.string()), // Bank/lender name
		contractNumber: v.optional(v.string()), // Loan/contract number
		collateral: v.optional(v.string()), // What secures the loan

		// Status
		status: loanStatusValidator,

		// Notes
		notes: v.optional(v.string()), // Contract-specific comments/notes

		// Metadata
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_status", ["userId", "status"])
		.index("by_next_payment", ["userId", "nextPaymentDate"]),

	loanPayments: defineTable({
		userId: v.string(),
		loanId: v.id("loans"),

		// Payment Details
		paymentDate: v.string(), // When payment was made (ISO)
		// Deprecated, informational only: the schedule derives the due date a
		// payment covers. Kept for existing documents.
		scheduledDate: v.optional(v.string()),

		amount: v.number(), // Total payment amount
		principalPortion: v.number(), // Amount applied to principal
		interestPortion: v.number(), // Amount applied to interest
		feesPortion: v.optional(v.number()), // Any fees included

		// Payment Type: scheduled (regular), additional_principal (extra
		// principal added to a payment), prepayment (one-time unscheduled),
		// final (payoff), partial (less than scheduled), late
		paymentType: loanPaymentTypeValidator,

		// Deprecated, informational only: no longer written or read. The
		// schedule derives balances from the recorded payments.
		balanceAfterPayment: v.optional(v.number()),

		// Notes
		notes: v.optional(v.string()),

		// Metadata
		createdAt: v.number(),
	})
		.index("by_loan", ["loanId"])
		.index("by_user", ["userId"])
		.index("by_date", ["userId", "paymentDate"]),

	loanScenarios: defineTable({
		userId: v.string(),
		loanId: v.id("loans"),

		name: v.string(), // Scenario name
		description: v.optional(v.string()),

		// Scenario Configuration
		// Extra principal paid with the regular payments (per payment period),
		// each between optional first/last due dates (YYYY-MM-DD, inclusive).
		// Read through resolveRecurringExtras, which maps the legacy fields.
		recurringExtras: v.optional(
			v.array(
				v.object({
					amount: v.number(),
					from: v.optional(v.string()),
					until: v.optional(v.string()),
				}),
			),
		),
		// Legacy single extra (a scenario saved before recurringExtras): read
		// as a one-entry recurringExtras, cleared when the extras are saved
		extraPerPeriod: v.optional(v.number()),
		// First due date the extra applies to (YYYY-MM-DD); from now when unset
		extraPerPeriodFrom: v.optional(v.string()),
		prepaymentEffect: v.optional(prepaymentEffectValidator),
		// Deprecated: misnamed, it always held the extra per period. Read as a
		// fallback for extraPerPeriod; backfilled by
		// migrations:backfillLoanScenarioExtraPerPeriod.
		extraMonthlyPayment: v.optional(v.number()),
		oneTimePrepayments: v.optional(
			v.array(
				v.object({
					date: v.string(),
					amount: v.number(),
				}),
			),
		),
		newInterestRate: v.optional(v.number()), // For refinancing scenarios

		// Calculated Results (cached)
		projectedEndDate: v.optional(v.string()),
		totalInterestSaved: v.optional(v.number()),
		monthsSaved: v.optional(v.number()),

		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_loan", ["loanId"])
		.index("by_user", ["userId"]),

	// ═══════════════════════════════════════════════════════════════
	// USER SETTINGS
	// ═══════════════════════════════════════════════════════════════

	userSettings: defineTable({
		userId: v.string(),
		displayName: v.optional(v.string()),
		birthDate: v.optional(v.string()), // ISO date (YYYY-MM-DD); current age is derived from this
		defaultCurrency: v.string(),
		language: v.optional(v.string()), // "en" or "de"
		theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
		dashboardLayout: v.optional(v.any()),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_user", ["userId"]),

	// ═══════════════════════════════════════════════════════════════
	// ONBOARDING PROGRESS
	// ═══════════════════════════════════════════════════════════════

	onboardingProgress: defineTable({
		userId: v.string(),
		currentStep: v.number(), // 1-6
		completedSteps: v.array(v.number()), // [1, 2, 3]
		skippedSteps: v.array(v.number()), // [3, 4]
		profileCompleted: v.boolean(),
		bankingConnected: v.boolean(),
		brokersConnected: v.boolean(),
		cryptoConnected: v.boolean(),
		onboardingCompleted: v.boolean(),
		completedAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_user", ["userId"]),

	// ═══════════════════════════════════════════════════════════════
	// RETIREMENT PLANNER ("Rentenplaner")
	// ═══════════════════════════════════════════════════════════════

	// One active plan per user. Computation lives in
	// services/finance/retirementService.ts (pure, unit-tested) and is composed
	// client-side from this plan + the dashboard net worth
	// (useRetirementFundingBase / usePortfolioOverview).
	retirementPlans: defineTable({
		userId: v.string(),

		// Wizard state
		currentStep: v.number(),
		status: v.union(v.literal("draft"), v.literal("active")),

		// Personal
		birthDate: v.optional(v.string()), // ISO date, preferred over currentAge
		currentAge: v.number(),
		retirementAge: v.number(),

		// Lifestyle
		monthlyExpensesToday: v.number(), // base currency, "today's money"

		// Housing / real estate
		ownsPrimaryResidence: v.boolean(),
		// DEPRECATED: write-only copy of ownsPrimaryResidence, never read. No
		// longer written; kept optional for existing documents.
		primaryResidenceExcluded: v.optional(v.boolean()),
		// The tracked loan on the home the user lives in: taken out of the
		// funding base, its repayments are a pre-retirement expense.
		primaryResidenceLoanId: v.optional(v.id("loans")),
		// Or a linked bank (Plaid) mortgage account instead of a tracked loan,
		// with its optional annual rate and monthly repayment (base currency)
		// to project the balance at retirement; without them the full balance
		// counts as owed then.
		primaryResidenceAccountId: v.optional(v.id("plaidAccounts")),
		primaryResidenceMortgageRate: v.optional(v.number()),
		primaryResidenceMortgagePayment: v.optional(v.number()),
		// Sellable property equity the user wants to count toward funding.
		fundableRealEstateEquity: v.optional(v.number()),
		// Growth treatment per funding category id (absent = service defaults).
		fundingTreatments: v.optional(
			v.record(v.string(), retirementFundingTreatmentValidator),
		),

		// Pension income (flexible list of monthly sources)
		pensionSources: v.array(retirementPensionSourceValidator),
		// Flat tax + health-insurance rate on gross pensions (absent = default).
		pensionDeductionRate: v.optional(v.number()),
		// Tax on withdrawals (absent = 0, i.e. a pre-tax target).
		withdrawalTaxRate: v.optional(v.number()),
		// Monthly saving rises with inflation (absent = flat nominal amount).
		indexContributions: v.optional(v.boolean()),

		// Assumptions (defaults applied on create)
		inflationRate: v.number(), // default 0.02
		withdrawalRate: v.number(), // default 0.04
		optimisticReturn: v.number(), // default 0.0718 (doubles every ~10y)
		conservativeReturn: v.number(), // default 0.05

		createdAt: v.number(),
		updatedAt: v.number(),
	}).index("by_user", ["userId"]),

	// ═══════════════════════════════════════════════════════════════
	// VAULT (Precious Metals)
	// ═══════════════════════════════════════════════════════════════

	// Metal catalog - predefined coins/bars with default premiums
	metalCatalog: defineTable({
		name: v.string(), // "Krugerrand 1 oz"
		metalType: v.union(
			v.literal("gold"),
			v.literal("silver"),
			v.literal("platinum"),
			v.literal("palladium"),
		),
		category: v.union(v.literal("coin"), v.literal("bar")),
		purity: v.number(), // 999.9, 916.7, etc.
		weightGrams: v.number(), // Total weight
		fineWeightGrams: v.number(), // Pure metal content
		fineWeightOz: v.number(), // Pure metal in troy ounces
		defaultBuyPremium: v.optional(v.number()), // 0.03 = 3% premium when buying (adds to spot price)
		defaultSellPremium: v.optional(v.number()), // -0.02 = 2% below spot when selling (negative = below spot)
		defaultPremium: v.optional(v.number()), // DEPRECATED - kept for migration
		country: v.optional(v.string()), // "South Africa"
		mint: v.optional(v.string()), // "South African Mint"
		year: v.optional(v.string()), // "various" or specific year
		diameter: v.optional(v.number()), // mm
		thickness: v.optional(v.number()), // mm
		imageUrl: v.optional(v.string()),
		isPopular: v.boolean(),
	})
		.index("by_metal", ["metalType"])
		.index("by_category", ["category"])
		.index("by_metal_category", ["metalType", "category"])
		.index("by_popular", ["isPopular"]),

	// User's vault items
	vaultItems: defineTable({
		userId: v.string(),

		// Item identification
		catalogItemId: v.optional(v.id("metalCatalog")), // If from catalog
		customName: v.optional(v.string()), // If custom item

		// Metal details
		metalType: v.union(
			v.literal("gold"),
			v.literal("silver"),
			v.literal("platinum"),
			v.literal("palladium"),
		),
		category: v.union(
			v.literal("coin"),
			v.literal("bar"),
			v.literal("jewelry"),
			v.literal("scrap"),
		),
		purity: v.number(), // Fineness (e.g., 999.9, 916.7)
		weightGrams: v.number(), // Total weight in grams
		fineWeightGrams: v.number(), // Pure metal weight in grams

		// Holdings. quantity and purchasePricePerUnit are cached projections
		// of the vaultTransactions ledger (services/finance/metalsLedger.ts):
		// quantity held and average cost in EUR, written by the mutation
		// that changes the ledger.
		quantity: v.number(),
		buyPremium: v.optional(v.number()), // Premium applied when buying (e.g., 0.03 = 3% above spot)
		sellPremium: v.optional(v.number()), // Premium/discount when selling (e.g., -0.02 = 2% below spot)
		premium: v.optional(v.number()), // DEPRECATED - kept for migration

		// Purchase info (supports backdated entries)
		purchasePricePerUnit: v.optional(v.number()),
		purchaseDate: v.optional(v.string()), // ISO date string
		purchaseCurrency: v.optional(v.string()), // "EUR" | "USD" | "CHF"

		// Storage & notes
		storageLocation: v.optional(v.string()),
		notes: v.optional(v.string()),

		// Images (Phase 6 - future)
		itemImageUrl: v.optional(v.string()),
		invoiceImageUrl: v.optional(v.string()),

		// Metadata
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_user_metal", ["userId", "metalType"])
		.index("by_user_category", ["userId", "category"]),

	// Transaction history - allows backdated entries
	vaultTransactions: defineTable({
		userId: v.string(),
		vaultItemId: v.id("vaultItems"),

		transactionType: v.union(
			v.literal("buy"),
			v.literal("sell"),
			v.literal("gift_received"),
			v.literal("gift_given"),
		),
		quantity: v.number(), // always > 0; the type gives the direction
		// Absent only on an opening balance whose cost is unknown
		pricePerUnit: v.optional(v.number()),
		currency: v.string(), // "EUR" | "USD" | "CHF"
		// EUR per unit at the rate of the transaction date, written with the
		// row (vault.ts basePricePerUnit) so ledger replays are deterministic.
		// Absent on older rows and when the price is unknown.
		pricePerUnitBase: v.optional(v.number()),
		// ISO date string - can be any past date. Absent only on an opening
		// balance whose date is unknown: held before any range (D3)
		transactionDate: v.optional(v.string()),
		// The item's opening balance (written with the item, or backfilled by
		// migrations.backfillVaultLedger). Absent on older documents, where
		// the opening is the one noted "Initial purchase".
		isOpening: v.optional(v.boolean()),

		// Spot price at transaction time (for accurate P/L calculation)
		spotPriceAtTransaction: v.optional(v.number()),

		notes: v.optional(v.string()),
		invoiceImageUrl: v.optional(v.string()),

		// Metadata
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_item", ["vaultItemId"])
		.index("by_date", ["userId", "transactionDate"]),

	// ═══════════════════════════════════════════════════════════════
	// WORLD BANK INDICATORS (for World Map search)
	// ═══════════════════════════════════════════════════════════════

	// All World Bank indicators (synced weekly)
	worldBankIndicators: defineTable({
		code: v.string(), // e.g., "NY.GDP.MKTP.CD"
		name: v.string(), // e.g., "GDP (current US$)"
		description: v.optional(v.string()), // sourceNote from API
		sourceId: v.optional(v.string()), // World Bank source ID (e.g., "2" for WDI)
		sourceName: v.optional(v.string()), // e.g., "World Development Indicators"
		topics: v.optional(v.array(v.string())), // Topic names

		// Search optimization - lowercase versions for efficient searching
		nameLower: v.string(), // Lowercase name for search
		codeLower: v.string(), // Lowercase code for search

		// Reliability tracking
		timeoutCount: v.number(), // Number of consecutive timeouts when fetching data
		status: v.union(
			v.literal("ok"), // Working fine
			v.literal("warning"), // 1-2 timeouts - may be slow/unreliable
			v.literal("error"), // 3+ timeouts - consistently failing
		),
		lastTestedAt: v.optional(v.number()), // When we last tested this indicator

		// Metadata
		syncedAt: v.number(), // When this indicator was last synced from World Bank
	})
		.index("by_code", ["code"])
		.index("by_status", ["status"])
		.index("by_name_lower", ["nameLower"])
		.index("by_code_lower", ["codeLower"])
		.searchIndex("search_indicators", {
			searchField: "nameLower",
			filterFields: ["status", "sourceId"],
		}),

	// Sync metadata - tracks when indicators were last synced
	worldBankSyncStatus: defineTable({
		lastFullSync: v.number(), // Timestamp of last complete sync
		indicatorCount: v.number(), // Total indicators synced
		syncDurationMs: v.number(), // How long the sync took
		status: v.union(
			v.literal("success"),
			v.literal("partial"), // Some pages failed
			v.literal("failed"),
		),
		errorMessage: v.optional(v.string()),
	}),

	// User's favorite World Bank indicators
	worldBankFavorites: defineTable({
		userId: v.string(), // Clerk user ID
		indicatorCode: v.string(), // World Bank indicator code (e.g., "NY.GDP.MKTP.CD")
		indicatorName: v.string(), // Display name at time of favoriting
		indicatorDescription: v.optional(v.string()),
		addedAt: v.number(), // Timestamp when favorited
	})
		.index("by_user", ["userId"])
		.index("by_user_indicator", ["userId", "indicatorCode"]),

	// ═══════════════════════════════════════════════════════════════
	// BITPANDA (mixed-asset: crypto, metals, commodities, stocks, fiat)
	// ═══════════════════════════════════════════════════════════════
	// Unlike the OAuth aggregators, Bitpanda uses a per-user read-only API
	// key (no SDK, no token refresh). One connection ≈ one API key ≈ the
	// user's whole Bitpanda account; holdings span multiple categories and
	// are routed by the classification engine.

	bitpandaConnections: defineTable({
		userId: v.string(), // Clerk user ID
		apiKey: v.string(), // Encrypted read-only Bitpanda API key (AES-256-GCM)
		label: v.optional(v.string()), // Optional user-provided name
		status: v.union(
			v.literal("active"),
			v.literal("error"),
			v.literal("syncing"),
			v.literal("disconnected"),
		),
		errorMessage: v.optional(v.string()),
		lastSyncAt: v.optional(v.number()),
		createdAt: v.number(),
		updatedAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_status", ["userId", "status"]),

	// Bitpanda holdings (one row per asset with a non-zero balance)
	bitpandaHoldings: defineTable({
		userId: v.string(), // Clerk user ID
		connectionId: v.id("bitpandaConnections"), // Reference to connection

		// Asset identification
		assetType: v.string(), // Normalized: crypto | metal | commodity | stock | etf | index | fiat
		symbol: v.string(), // "BTC", "XAU", "TSLA", "EUR"
		name: v.optional(v.string()),

		// Holdings (valued in EUR)
		quantity: v.number(),
		currentPrice: v.optional(v.number()), // EUR price per unit
		marketValue: v.optional(v.number()), // EUR value
		currency: v.string(), // "EUR"
		// live: this sync's ticker price; stale: an earlier sync's price kept
		// when the ticker had none; missing: never priced (value unset)
		// (services/bitpanda/holdingPrice.ts). Unset on rows synced before it.
		priceStatus: v.optional(
			v.union(v.literal("live"), v.literal("stale"), v.literal("missing")),
		),
		priceAsOf: v.optional(v.number()), // when currentPrice was priced (ms)

		// Classification fields
		investmentCategory: v.optional(v.string()),
		investmentSubcategory: v.optional(v.string()),
		classificationSource: v.optional(v.string()),
		classificationRule: v.optional(v.string()),
		userCategoryOverride: v.optional(v.string()),
		userSubcategoryOverride: v.optional(v.string()),

		// Currency conversion fields
		valueInBaseCurrency: v.optional(v.number()),
		exchangeRateUsed: v.optional(v.number()),
		exchangeRateTimestamp: v.optional(v.number()),
		baseCurrency: v.optional(v.string()),

		lastSyncAt: v.optional(v.number()),
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_connection", ["connectionId"])
		.index("by_symbol", ["userId", "symbol"])
		.index("by_category", ["userId", "investmentCategory"])
		.index("by_subcategory", [
			"userId",
			"investmentCategory",
			"investmentSubcategory",
		]),

	// Bitpanda transactions (trades + crypto/fiat/commodity transactions)
	bitpandaTransactions: defineTable({
		userId: v.string(), // Clerk user ID
		connectionId: v.id("bitpandaConnections"), // Reference to connection
		bitpandaTransactionId: v.string(), // Bitpanda's transaction/trade ID

		type: v.string(), // buy | sell | deposit | withdrawal | transfer | reward | other
		symbol: v.string(),
		assetType: v.optional(v.string()), // crypto | metal | commodity | stock | fiat | unknown
		quantity: v.number(),
		price: v.optional(v.number()), // Price per unit
		amount: v.number(), // Total fiat amount
		currency: v.string(),
		fees: v.optional(v.number()),
		transactionDate: v.string(), // ISO 8601
		createdAt: v.number(),
	})
		.index("by_user", ["userId"])
		.index("by_connection", ["connectionId"])
		.index("by_date", ["userId", "transactionDate"])
		.index("by_bitpanda_id", ["bitpandaTransactionId"]),

	// ═══════════════════════════════════════════════════════════════
	// PORTFOLIO SNAPSHOTS
	// ═══════════════════════════════════════════════════════════════
	// Stores portfolio value snapshots taken after each sync operation
	// Used for historical performance tracking

	portfolioSnapshots: defineTable({
		userId: v.string(), // Clerk user ID
		timestamp: v.number(), // Unix timestamp in milliseconds
		date: v.string(), // ISO date string (YYYY-MM-DD) for easier querying

		// Total portfolio values
		totalAssets: v.number(), // Sum of all asset values
		totalLiabilities: v.number(), // Sum of all liabilities
		netWorth: v.number(), // totalAssets - totalLiabilities
		totalCostBasis: v.optional(v.number()), // Total cost basis if available
		// Value of the holdings totalCostBasis covers (absent on snapshots
		// written before it existed; readers fall back to totalAssets)
		totalCoveredValue: v.optional(v.number()),

		// Breakdown by category (for detailed analysis)
		categoryBreakdown: v.optional(
			v.array(
				v.object({
					category: v.string(), // "equities", "cash", "commodities", etc.
					value: v.number(),
					costBasis: v.optional(v.number()),
					// Value of the holdings costBasis covers (absent on old
					// snapshots; readers fall back to value)
					coveredValue: v.optional(v.number()),
					// Value per source (services/portfolio/aggregate.ts
					// HoldingSource), e.g. vault vs bitpanda metals in
					// commodities; absent on old snapshots
					sources: v.optional(
						v.array(
							v.object({
								source: v.string(),
								value: v.number(),
								// Holdings of a flow-adjusted category, for the
								// next day's flows (aggregate.ts
								// SnapshotHoldingEntry); kept on the two newest
								// rows only, never returned by getSnapshots
								holdings: v.optional(
									v.array(
										v.object({
											key: v.string(), // identity across syncs
											value: v.number(),
											cost: v.optional(v.number()), // base currency
											costNative: v.optional(v.number()), // in `currency`
											currency: v.optional(v.string()),
										}),
									),
								),
								// Cost of the source's holdings that have one,
								// and the value it covers (0 when none has);
								// absent on older rows (aggregate.ts
								// SnapshotSourceEntry)
								costBasis: v.optional(v.number()),
								coveredValue: v.optional(v.number()),
								// External flow into the source since the
								// previous day's snapshot
								netFlow: v.optional(v.number()),
								netFlowEstimated: v.optional(v.boolean()),
							}),
						),
					),
					// External flow into the category since the previous
					// day's snapshot (aggregate.ts categoryFlowFromHoldings);
					// absent on rows that could not be compared with the
					// previous one, which readers estimate
					netFlow: v.optional(v.number()),
					// Part of netFlow is assumed (holdings without cost basis)
					netFlowEstimated: v.optional(v.boolean()),
				}),
			),
		),

		// Sync source that last wrote this snapshot (one row per user per
		// day, upserted; older days may hold several intraday rows)
		source: v.string(), // "plaid", "snaptrade", "loan", "vault", "scheduled-daily", ...
		// true when a provider sync before the snapshot failed, so that
		// provider's holdings are from its last successful sync
		partial: v.optional(v.boolean()),
		// Data freshness: oldest provider sync / spot price behind the values
		asOf: v.optional(v.number()),
	})
		.index("by_user", ["userId"])
		.index("by_user_date", ["userId", "date"])
		.index("by_user_timestamp", ["userId", "timestamp"]),

	// ═══════════════════════════════════════════════════════════════
	// METAL SPOT PRICES
	// ═══════════════════════════════════════════════════════════════
	// Latest EUR spot price per troy ounce, one row per metal, mirrored from
	// the SQL price store by convex/metalPrices.ts so server-side net worth
	// (lib/netWorth.ts) can value vault items at market like the dashboard.

	metalSpotPrices: defineTable({
		metalType: v.union(
			v.literal("gold"),
			v.literal("silver"),
			v.literal("platinum"),
			v.literal("palladium"),
		),
		eurPerOunce: v.number(),
		sourceTimestamp: v.number(), // When the price was observed upstream
		fetchedAt: v.number(),
	}).index("by_metal", ["metalType"]),

	// ═══════════════════════════════════════════════════════════════
	// FX RATES
	// ═══════════════════════════════════════════════════════════════
	// Daily EUR-base exchange rates, one row per (date, currency), mirrored
	// from the SQL currency_exchange_rates store by convex/fxRates.ts. The
	// single rate source for base-currency conversion
	// (services/finance/currency.ts).

	fxRates: defineTable({
		date: v.string(), // UTC day, YYYY-MM-DD
		currency: v.string(), // ISO 4217 code, e.g. "USD"
		unitsPerEur: v.number(), // Units of the currency per 1 EUR
		fetchedAt: v.number(),
	})
		.index("by_currency_date", ["currency", "date"])
		.index("by_date", ["date"]),

	// ═══════════════════════════════════════════════════════════════
	// API KEYS
	// ═══════════════════════════════════════════════════════════════
	// User-scoped keys for the public REST API (convex/http.ts).
	// Only the SHA-256 hash of a key is stored; the plaintext is shown once.

	apiKeys: defineTable({
		userId: v.string(), // Clerk user ID that owns the key
		name: v.string(), // User-chosen label
		keyHash: v.string(), // Hex SHA-256 of the full key
		keyPrefix: v.string(), // Non-secret display prefix, e.g. "fis_AbC123"
		scopes: v.array(v.literal("networth:read")),
		createdAt: v.number(),
		expiresAt: v.optional(v.number()),
		revokedAt: v.optional(v.number()),
		lastUsedAt: v.optional(v.number()),
		// Fixed-window rate limiter state
		rateWindowStart: v.optional(v.number()),
		rateWindowCount: v.optional(v.number()),
	})
		.index("by_user", ["userId"])
		.index("by_key_hash", ["keyHash"]),
});
