import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
		// Currency conversion fields
		valueInBaseCurrency: v.optional(v.number()), // Balance in EUR
		exchangeRateUsed: v.optional(v.number()), // Rate at sync time
		exchangeRateTimestamp: v.optional(v.number()), // When rate was fetched
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
		cashValueInBaseCurrency: v.optional(v.number()), // Cash value in EUR
		cashExchangeRateUsed: v.optional(v.number()), // Rate at sync time
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
		assetType: v.string(), // "equity", "etf", "option", "bond", "mutual_fund", "cryptocurrency", "forex", "other"
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
		dayPL: v.optional(v.number()), // Today's P&L
		dayPLPercent: v.optional(v.number()), // Today's P&L percentage
		// Classification fields
		investmentCategory: v.optional(v.string()), // "equities", "cash", "bonds", etc.
		investmentSubcategory: v.optional(v.string()), // "stocks", "etfs", "broker-cash", etc.
		classificationSource: v.optional(v.string()), // "auto", "user_override", "admin"
		classificationRule: v.optional(v.string()), // Rule ID that matched
		userCategoryOverride: v.optional(v.string()), // User's manual category override
		userSubcategoryOverride: v.optional(v.string()), // User's manual subcategory override
		// Currency conversion fields
		valueInBaseCurrency: v.optional(v.number()), // Market value in EUR
		exchangeRateUsed: v.optional(v.number()), // Rate at sync time
		exchangeRateTimestamp: v.optional(v.number()), // When rate was fetched
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

	// Broker transactions/activities
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
		.index("by_date", ["userId", "tradeDate"])
		.index("by_snaptrade_id", ["snaptradeActivityId"]),

	// ═══════════════════════════════════════════════════════════════
	// LOANS (Debt Management)
	// ═══════════════════════════════════════════════════════════════

	loans: defineTable({
		userId: v.string(), // Clerk user ID

		// Basic Loan Information
		name: v.string(), // User-friendly name (e.g., "Home Mortgage", "Car Loan")
		loanType: v.union(
			v.literal("ANNUITY"),
			v.literal("CONSTANT_PRINCIPAL"),
			v.literal("BULLET"),
			v.literal("INTEREST_ONLY_THEN"),
		),

		// Financial Details
		originalPrincipal: v.number(), // Original loan amount
		currentBalance: v.number(), // Current outstanding balance
		annualInterestRate: v.number(), // Interest rate as decimal (e.g., 0.05 for 5%)
		currency: v.string(), // ISO currency code

		// Term & Schedule
		termMonths: v.number(), // Original loan term in months
		paymentFrequency: v.union(
			v.literal("MONTHLY"),
			v.literal("QUARTERLY"),
			v.literal("SEMI_ANNUAL"),
			v.literal("ANNUAL"),
		),
		scheduledPayment: v.number(), // Regular payment amount

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
		status: v.union(
			v.literal("active"),
			v.literal("paid_off"),
			v.literal("defaulted"),
			v.literal("refinanced"),
		),

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
		scheduledDate: v.optional(v.string()), // When it was supposed to be paid

		amount: v.number(), // Total payment amount
		principalPortion: v.number(), // Amount applied to principal
		interestPortion: v.number(), // Amount applied to interest
		feesPortion: v.optional(v.number()), // Any fees included

		// Payment Type
		paymentType: v.union(
			v.literal("scheduled"), // Regular scheduled payment
			v.literal("additional_principal"), // Extra principal added to scheduled payment
			v.literal("prepayment"), // One-time unscheduled prepayment
			v.literal("final"), // Final payoff payment
			v.literal("partial"), // Partial payment (less than scheduled)
			v.literal("late"), // Late payment
		),

		// Balance Tracking
		balanceAfterPayment: v.number(), // Remaining balance after this payment

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
	// client-side from this plan + getTotalNetWorth().
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
		// Owner-occupied home is excluded from the 4%-rule funding base (cannot be
		// sold and lived in). Stored explicitly for UI clarity.
		primaryResidenceExcluded: v.boolean(),
		// Sellable property equity the user wants to count toward funding.
		fundableRealEstateEquity: v.optional(v.number()),

		// Pension income (flexible list of monthly sources)
		pensionSources: v.array(
			v.object({
				label: v.string(),
				monthlyAmount: v.number(),
			}),
		),

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

		// Holdings
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
		quantity: v.number(),
		pricePerUnit: v.number(),
		currency: v.string(), // "EUR" | "USD" | "CHF"
		transactionDate: v.string(), // ISO date string - can be any past date

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

		// Breakdown by category (for detailed analysis)
		categoryBreakdown: v.optional(
			v.array(
				v.object({
					category: v.string(), // "equities", "cash", "commodities", etc.
					value: v.number(),
					costBasis: v.optional(v.number()),
				}),
			),
		),

		// Sync source that triggered this snapshot
		source: v.string(), // "plaid", "snaptrade", "manual", "vault", "scheduled"
	})
		.index("by_user", ["userId"])
		.index("by_user_date", ["userId", "date"])
		.index("by_user_timestamp", ["userId", "timestamp"]),
});
