# Loans Management Page - Feature Specification

## Overview

A comprehensive loans management page under `debt/loans` that allows users to:

- Track and manage all their current loans
- Simulate "what-if" scenarios (extra payments, refinancing)
- Log payments made and view payment history
- See upcoming scheduled payments
- Store contract-specific notes/comments
- Visualize loan progress and projections

---

## 1. Data Model (Convex Schema)

### 1.1 Loans Table

```typescript
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
  .index("by_next_payment", ["userId", "nextPaymentDate"]);
```

### 1.2 Loan Payments Table

```typescript
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
    v.literal("extra"), // Extra/additional payment
    v.literal("prepayment"), // Lump sum prepayment
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
  .index("by_date", ["userId", "paymentDate"]);
```

### 1.3 Loan Scenarios Table (What-If Analysis)

```typescript
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
  .index("by_user", ["userId"]);
```

---

## 2. Page Layout & Structure

### 2.1 Main Page Structure (`/debt/loans`)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📋 My Loans                                            [+ Add Loan] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ SUMMARY CARDS                                                 │  │
│  │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐         │  │
│  │ │Total Debt│ │Monthly   │ │Next      │ │Payoff    │         │  │
│  │ │$245,000  │ │Payments  │ │Payment   │ │Progress  │         │  │
│  │ │          │ │$2,847    │ │Feb 1st   │ │23%       │         │  │
│  │ └──────────┘ └──────────┘ └──────────┘ └──────────┘         │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ UPCOMING PAYMENTS (Next 30 days)                              │  │
│  │ ┌────────────────────────────────────────────────────────┐   │  │
│  │ │ Feb 1  │ Home Mortgage    │ $1,847.23 │ [Pay Now]      │   │  │
│  │ │ Feb 5  │ Car Loan         │ $450.00   │ [Pay Now]      │   │  │
│  │ │ Feb 15 │ Personal Loan    │ $550.00   │ [Pay Now]      │   │  │
│  │ └────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ MY LOANS                                      [Grid/List] 🔍  │  │
│  │                                                               │  │
│  │ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐              │  │
│  │ │ 🏠 Home     │ │ 🚗 Car      │ │ 💰 Personal │              │  │
│  │ │ Mortgage    │ │ Loan        │ │ Loan        │              │  │
│  │ │             │ │             │ │             │              │  │
│  │ │ $195,000    │ │ $25,000     │ │ $15,000     │              │  │
│  │ │ 3.75%       │ │ 5.9%        │ │ 8.5%        │              │  │
│  │ │ ████░░ 35%  │ │ ██████░ 67% │ │ ██░░░░ 25%  │              │  │
│  │ │ 22y 3m left │ │ 3y 2m left  │ │ 4y 1m left  │              │  │
│  │ └─────────────┘ └─────────────┘ └─────────────┘              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Loan Detail Page (`/debt/loans/[loanId]`)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Back to Loans                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ 🏠 Home Mortgage                              [Edit] [Delete] │  │
│  │ Wells Fargo • Contract #12345-67890                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  [Overview] [Payments] [Scenarios] [Schedule] [Notes]              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  OVERVIEW TAB:                                                      │
│  ┌────────────────────────────────┬─────────────────────────────┐  │
│  │  LOAN PROGRESS                 │  KEY METRICS                │  │
│  │                                │                             │  │
│  │  ┌────────────────────────┐   │  Original: $300,000         │  │
│  │  │  [Circular Progress]   │   │  Remaining: $195,000        │  │
│  │  │       65%              │   │  Paid: $105,000             │  │
│  │  │     Remaining          │   │                             │  │
│  │  └────────────────────────┘   │  Interest Rate: 3.75%       │  │
│  │                                │  Monthly Payment: $1,389    │  │
│  │  $105,000 paid of $300,000    │  Next Due: Feb 1, 2026      │  │
│  └────────────────────────────────┴─────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  BALANCE OVER TIME (Interactive Chart)                        │  │
│  │                                                               │  │
│  │  $300k ┐                                                      │  │
│  │        │\                                                     │  │
│  │  $200k │ \                                                    │  │
│  │        │  \___                                                │  │
│  │  $100k │      \___                                            │  │
│  │        │          \___                                        │  │
│  │  $0    └──────────────────────────────────────────           │  │
│  │         2020   2025   2030   2035   2040   2045              │  │
│  │                                                               │  │
│  │  [Show: ● Actual ○ Projected ○ With Extra Payments]          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  QUICK ACTIONS                                                │  │
│  │                                                               │  │
│  │  [💳 Record Payment] [➕ Extra Payment] [🔄 Refinance Calc]   │  │
│  │  [📊 What-If Analysis] [📥 Export Schedule]                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Feature Breakdown

### 3.1 Loan Dashboard Features

#### Summary Cards

- **Total Debt**: Sum of all active loan balances
- **Monthly Payments**: Sum of all scheduled monthly payments
- **Next Payment**: Closest upcoming payment with amount and date
- **Payoff Progress**: Overall percentage of loans paid off

#### Upcoming Payments Widget

- Shows payments due in the next 30 days
- Sortable by date, amount, or loan name
- Quick "Record Payment" action for each
- Visual indicators for overdue payments

#### Loan Cards/List

- Toggle between grid and list view
- Each card shows:
  - Loan name and icon
  - Current balance
  - Interest rate
  - Visual progress bar
  - Time remaining
  - Next payment amount/date
- Click to open loan detail page

### 3.2 Individual Loan Features

#### Overview Tab

- Circular/arc progress visualization
- Key metrics at a glance
- Interactive balance chart (actual vs projected)
- Quick action buttons

#### Payments Tab

- **Payment History Table**
  - Date, amount, principal/interest split
  - Payment type badges (scheduled, extra, prepayment)
  - Notes for each payment
  - Filterable and searchable
- **Record New Payment** (Modal/Sheet)
  - Date picker
  - Amount input with auto-fill for scheduled amount
  - Payment type selector
  - Principal/Interest split (auto-calculated or manual)
  - Notes field
  - Validation against loan balance

#### Scenarios Tab (What-If Analysis)

This is the "play around" section. Users can create and compare scenarios:

- **Scenario Builder**

  ```
  ┌────────────────────────────────────────────────────────────────┐
  │ 💡 What-If Scenario Builder                                    │
  ├────────────────────────────────────────────────────────────────┤
  │                                                                │
  │ Scenario Name: [Extra $200/month________________]              │
  │                                                                │
  │ ADJUSTMENTS:                                                   │
  │ ┌────────────────────────────────────────────────────────────┐│
  │ │ Extra Monthly Payment: [$200_______]                       ││
  │ │                                                            ││
  │ │ One-Time Prepayments:                                      ││
  │ │ ┌──────────────────────────────────────────────────────┐  ││
  │ │ │ Date         │ Amount      │                [Remove] │  ││
  │ │ │ Jun 2026     │ $5,000      │                         │  ││
  │ │ │ Dec 2026     │ $3,000      │                         │  ││
  │ │ └──────────────────────────────────────────────────────┘  ││
  │ │                                          [+ Add Prepayment]││
  │ │                                                            ││
  │ │ Refinance at New Rate: [_____%] (optional)                 ││
  │ └────────────────────────────────────────────────────────────┘│
  │                                                                │
  │ COMPARISON RESULTS:                                            │
  │ ┌────────────────────────────────────────────────────────────┐│
  │ │           │ Current Plan  │ This Scenario │ Difference    ││
  │ │ Payoff    │ Mar 2048      │ Aug 2043      │ 4y 7m earlier ││
  │ │ Total Int │ $215,432      │ $156,890      │ Save $58,542  ││
  │ │ Total Paid│ $515,432      │ $456,890      │ Save $58,542  ││
  │ └────────────────────────────────────────────────────────────┘│
  │                                                                │
  │ [Save Scenario] [Apply to Loan] [Compare Multiple]            │
  └────────────────────────────────────────────────────────────────┘
  ```

- **Scenario Comparison View**
  - Side-by-side comparison of multiple scenarios
  - Charts showing different payoff trajectories
  - Highlight the best scenario for interest savings

#### Schedule Tab (Amortization)

- Full amortization schedule table
- Year-by-year or period-by-period view
- Collapsible year groups
- Shows:
  - Period number
  - Payment date
  - Opening balance
  - Payment amount
  - Principal portion
  - Interest portion
  - Closing balance
- Export to CSV/PDF
- Interactive: click any row to see cumulative totals

#### Notes Tab

- Rich text editor for contract-specific notes
- Auto-save
- Timestamps for edits
- Categories/tags for organization
- File attachments (contract PDF, etc.) - stretch goal

### 3.3 Add/Edit Loan Modal

```
┌────────────────────────────────────────────────────────────────────┐
│ ➕ Add New Loan                                              [×]   │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│ BASIC INFORMATION                                                  │
│ ┌────────────────────────────────────────────────────────────────┐│
│ │ Loan Name*          [Home Mortgage___________________]         ││
│ │ Loan Type*          [▼ Annuity (Fixed Payment)      ]         ││
│ │ Lender              [Wells Fargo_____________________]         ││
│ │ Contract Number     [12345-67890_____________________]         ││
│ └────────────────────────────────────────────────────────────────┘│
│                                                                    │
│ FINANCIAL DETAILS                                                  │
│ ┌────────────────────────────────────────────────────────────────┐│
│ │ Original Amount*    [$300,000___] Currency [▼ USD]             ││
│ │ Current Balance*    [$195,000___]                              ││
│ │ Interest Rate*      [3.75______] % per year                    ││
│ │ Regular Payment*    [$1,389.35_] per [▼ Month]                 ││
│ └────────────────────────────────────────────────────────────────┘│
│                                                                    │
│ DATES & TERM                                                       │
│ ┌────────────────────────────────────────────────────────────────┐│
│ │ Start Date*         [📅 Jan 15, 2020]                          ││
│ │ Original Term       [360_______] months (30 years)             ││
│ │ Next Payment Due*   [📅 Feb 1, 2026]                           ││
│ └────────────────────────────────────────────────────────────────┘│
│                                                                    │
│ ADVANCED OPTIONS (optional)                              [Expand]  │
│ ┌────────────────────────────────────────────────────────────────┐│
│ │ Max Annual Prepayment  [5___] % of principal                   ││
│ │ Prepayment Penalty     [0___] %                                ││
│ │ Collateral             [Primary Residence_____________]        ││
│ │ Grace Periods          [0___] (for interest-only loans)        ││
│ └────────────────────────────────────────────────────────────────┘│
│                                                                    │
│ NOTES                                                              │
│ ┌────────────────────────────────────────────────────────────────┐│
│ │ [Contract notes, special terms, contact info, etc.           ] ││
│ │ [                                                             ] ││
│ └────────────────────────────────────────────────────────────────┘│
│                                                                    │
│                                    [Cancel]  [Save Loan]           │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Visualizations

### 4.1 Balance Over Time Chart

- **Line chart** showing:
  - Historical balance (from payments)
  - Projected balance (from amortization schedule)
  - What-if scenario overlays
- Interactive tooltips
- Zoom and pan
- Toggle between loans for comparison

### 4.2 Payment Breakdown Chart (Stacked Area)

- Shows principal vs interest over time
- Visualizes how early payments are interest-heavy
- Cumulative view option

### 4.3 Payoff Progress Visualization

- Circular progress ring for individual loans
- Horizontal progress bar for overview
- Animated transitions

### 4.4 Debt Snowball/Avalanche Calculator

- Compare strategies for paying off multiple loans
- Show optimal payment order
- Time and interest savings comparison

### 4.5 Interest Rate Impact Chart

- Show how different rates would affect total cost
- Slider to adjust rate and see real-time impact

---

## 5. Interactive Features

### 5.1 Payment Slider Simulator

```
┌────────────────────────────────────────────────────────────────┐
│ 🎚️ Extra Payment Simulator                                    │
│                                                                │
│ Add extra payment per month:                                   │
│ $0 ────────●────────────────────────────────────────── $1,000  │
│                 $200                                           │
│                                                                │
│ Results:                                                       │
│ ├─ Pay off 4 years and 7 months earlier                       │
│ ├─ Save $58,542 in interest                                   │
│ └─ New payoff date: August 2043                               │
│                                                                │
│ [Apply This Change]                                            │
└────────────────────────────────────────────────────────────────┘
```

### 5.2 Payoff Goal Calculator

```
┌────────────────────────────────────────────────────────────────┐
│ 🎯 I want to pay off this loan by:                             │
│                                                                │
│ [📅 December 2035___________]                                  │
│                                                                │
│ To achieve this goal:                                          │
│ ├─ You need to pay $2,156/month (currently $1,389)            │
│ ├─ Extra payment needed: $767/month                           │
│ └─ You'll save $89,234 in interest                            │
│                                                                │
│ [Create Scenario with This Goal]                               │
└────────────────────────────────────────────────────────────────┘
```

### 5.3 Lump Sum Impact Calculator

```
┌────────────────────────────────────────────────────────────────┐
│ 💰 If I make a lump sum payment of:                            │
│                                                                │
│ [$10,000_________]  on  [📅 March 2026]                        │
│                                                                │
│ Impact:                                                        │
│ ├─ Reduces term by: 2 years 3 months                          │
│ ├─ Interest saved: $24,567                                    │
│ ├─ New payoff date: December 2045                             │
│ └─ Prepayment penalty: $0                                     │
│                                                                │
│ [Record This Payment] [Save as Scenario]                       │
└────────────────────────────────────────────────────────────────┘
```

---

## 6. Notifications & Reminders

### 6.1 Payment Reminders

- Browser notifications for upcoming payments
- Email reminders (configurable: 1 day, 3 days, 1 week before)
- Dashboard banner for overdue payments

### 6.2 Milestone Celebrations

- "You've paid off 50% of your mortgage! 🎉"
- "Only 1 year left on your car loan!"
- Progress milestone badges

---

## 7. Technical Implementation Notes

### 7.1 File Structure

```
frontend/
├── app/(root)/
│   └── debt/
│       └── loans/
│           ├── page.tsx                 # Loans dashboard
│           ├── [loanId]/
│           │   └── page.tsx             # Loan detail page
│           └── new/
│               └── page.tsx             # Add new loan page (optional, could be modal)
├── components/
│   └── atomic/
│       ├── molecules/
│       │   ├── loan-card.tsx
│       │   ├── payment-form.tsx
│       │   ├── scenario-builder.tsx
│       │   └── payment-slider.tsx
│       └── organisms/
│           ├── loans-dashboard.tsx
│           ├── loan-detail-tabs.tsx
│           ├── payment-history-table.tsx
│           ├── amortization-schedule.tsx
│           └── scenario-comparison.tsx
├── convex/
│   ├── schema.ts                        # Add loan tables
│   └── loans.ts                         # Loan queries and mutations
└── hooks/
    └── convex/
        └── loans.ts                     # React hooks for loans
```

### 7.2 Convex Functions to Implement

**Queries:**

- `getLoans` - Get all loans for user
- `getLoan` - Get single loan with details
- `getLoanPayments` - Get payment history for a loan
- `getUpcomingPayments` - Get next N payments across all loans
- `getLoanScenarios` - Get saved scenarios for a loan
- `getAmortizationSchedule` - Calculate full schedule for a loan

**Mutations:**

- `createLoan` - Add new loan
- `updateLoan` - Update loan details
- `deleteLoan` - Remove loan (soft delete?)
- `recordPayment` - Add payment record
- `updatePayment` - Edit existing payment
- `deletePayment` - Remove payment record
- `saveScenario` - Save what-if scenario
- `applyScenario` - Apply scenario changes to loan

### 7.3 Calculations (Reuse from financeService.ts)

- Use existing `calculateLoanSchedule` function
- Add scenario comparison helper functions
- Add payment projection with extra payments

---

## 8. Future Enhancements (Phase 2+)

- [ ] Import loans from banking connections (Plaid)
- [ ] Automatic payment detection from transactions
- [ ] Debt consolidation calculator
- [ ] Refinancing comparison tool
- [ ] Credit score impact estimation
- [ ] Multi-currency support
- [ ] Shared loans (between partners)
- [ ] Loan document storage
- [ ] Integration with budgeting features
- [ ] Push notifications for mobile

---

## 9. UI/UX Considerations

### Color Coding

- **Green**: Progress, paid portions, savings
- **Blue**: Current balance, projections
- **Orange**: Interest, warnings
- **Red**: Overdue, penalties, debt

### Accessibility

- All charts have tabular alternatives
- High contrast mode support
- Screen reader friendly progress indicators
- Keyboard navigation for all interactive elements

### Mobile Responsiveness

- Collapsible sections on mobile
- Swipeable loan cards
- Bottom sheet for modals
- Simplified charts for small screens

---

## 10. Example User Flows

### Flow 1: Add First Loan

1. User clicks "Add Loan" button
2. Guided form with helpful tooltips
3. Auto-calculation of missing fields where possible
4. Confirmation with summary
5. Redirect to loan detail page

### Flow 2: Record Monthly Payment

1. Dashboard shows "Payment Due Tomorrow" alert
2. User clicks "Record Payment"
3. Form pre-fills with scheduled amount
4. User confirms
5. Balance updates, next payment date advances
6. Celebration if milestone reached

### Flow 3: What-If Analysis

1. User opens loan detail, goes to Scenarios tab
2. Creates "Extra $500/month" scenario
3. Sees instant preview of impact
4. Saves scenario for future reference
5. Decides to actually add extra payment
6. Records the payment with the extra amount

---

This specification provides a comprehensive foundation for building a powerful, user-friendly loans management feature that integrates well with the existing Fiscalis ecosystem and reuses calculation logic from the loan calculator.
