# Fiscalis Onboarding Architecture

## Creative Prompt for AI-Assisted Development

**ACT AS:**
A world-class Creative Developer (Awwwards-level) specializing in Next.js 14+, Framer Motion, and premium financial application UX design. You have deep expertise in creating seamless, visually stunning onboarding experiences that convert users while maintaining a professional, trustworthy aesthetic.

**THE TASK:**
Build a high-end, multi-step onboarding flow for "Fiscalis" — a premium personal wealth management application. The core value proposition is "Finanzguru for Investments" — a single platform to track all assets, liabilities, and calculate true net worth.

**TECH STACK:**

- Framework: Next.js 16+ (App Router)
- Auth: Clerk (already integrated)
- Backend: Convex (real-time sync)
- Styling: Tailwind CSS + shadcn/ui
- Animation: Framer Motion
- Charts: Recharts (for demo visualizations)
- Financial Connections: Plaid (Banking), SnapTrade (Brokers), Vezgo (Crypto)

**VISUAL DIRECTION & COLOR PALETTE:**

- **Primary Background:** Pure dark mode `#050505` to `#0a0a0f` with subtle gradients
- **Foreground Text:** `#fafafa` (headings), `rgba(255,255,255,0.7)` (body)
- **Primary Accent (Gold):** `#D4AF37` (muted gold), `#FFD700` (bright highlights)
- **Secondary Accent (Blue):** `#3B82F6` (bright blue), `#1D4ED8` (deep blue)
- **Success/Profit:** `#22c55e` (emerald green)
- **Card Backgrounds:** `rgba(255,255,255,0.03)` with glass morphism
- **Borders:** `rgba(255,255,255,0.08)` subtle dividers
- **Typography:** Inter font family, clean tracking-tight, minimalist

**DESIGN PRINCIPLES:**

1. **Trust First:** Financial apps require trust. Every element should feel secure, professional, and premium.
2. **Progressive Disclosure:** Never overwhelm. Reveal complexity gradually through the steps.
3. **Skippable but Guided:** Every step optional, but clear benefits shown for completion.
4. **Celebrate Progress:** Micro-animations and visual feedback for every action.
5. **Mobile-First Responsive:** Touch-friendly, works beautifully on all devices.

---

## Onboarding Flow Architecture

### Overview

The onboarding consists of **6 distinct steps** with a persistent progress indicator:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           ONBOARDING FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐   │
│  │ Welcome │ → │ Profile │ → │ Banking │ → │ Brokers │ → │ Crypto  │   │
│  │  Intro  │   │  Setup  │   │ Connect │   │ Connect │   │ Connect │   │
│  └─────────┘   └─────────┘   └─────────┘   └─────────┘   └─────────┘   │
│       ↓             ↓             ↓             ↓             ↓         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                        COMPLETION                                │   │
│  │                   Dashboard Preview + CTA                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Step 1: Welcome & Value Proposition (Mandatory)

**Purpose:** Hook the user, explain the value, set expectations.

**Content:**

- Animated logo reveal with gold shimmer effect
- Headline: "Welcome to Fiscalis"
- Subheadline: "Your complete wealth picture, in one place."
- 3 Key Value Props with icons:
  1. 📊 "Track Everything" — Stocks, crypto, real estate, cash, precious metals
  2. 💳 "Know Your Debts" — Loans, mortgages, credit cards at a glance
  3. 📈 "True Net Worth" — Assets minus liabilities, updated in real-time
- Animated mockup/demo showing the dashboard with placeholder data
- Primary CTA: "Let's Get Started"

**Visual Elements:**

- Full-screen gradient background with subtle animated particles
- Floating 3D-esque asset cards (gold bar, bitcoin, stock chart) with parallax
- Progress indicator shows Step 1 of 6

**Image Placeholder & AI Prompt:**

```
[PLACEHOLDER: hero-dashboard-mockup.png]
AI Image Generation Prompt:
"A premium dark-mode financial dashboard UI mockup showing a wealth overview.
Style: Minimalist, clean, professional. Colors: Black background (#0a0a0f),
white text, gold (#D4AF37) and blue (#3B82F6) accent colors. Content: Large
net worth number at top, pie chart showing asset allocation (stocks, crypto,
real estate, cash), small line chart showing growth trend. Subtle glass
morphism effect on cards. No text visible, abstract shapes only. 8K quality,
UI/UX design style, Dribbble aesthetic."
```

---

### Step 2: Profile Setup (Recommended, Skippable)

**Purpose:** Collect basic user preferences for personalization.

**Fields:**

- Display Name (pre-filled from Clerk if available)
- Preferred Currency (dropdown: EUR, USD, GBP, CHF)
- Language (dropdown: English, German)
- Theme Preference (Light/Dark/System) — default to Dark

**UX Features:**

- Form validation with inline feedback
- Auto-save to Convex `userSettings` table
- "Skip for Now" link (smaller, secondary)
- Primary CTA: "Continue"

**Animation:**

- Slide-in from right
- Input fields appear staggered
- Currency dropdown shows flag icons

---

### Step 3: Connect Banking (Recommended, Skippable)

**Purpose:** Link bank accounts via Plaid.

**Content:**

- Headline: "Connect Your Bank Accounts"
- Subheadline: "See your checking, savings, and credit cards in one view"
- Benefits list with icons:
  - ✓ Automatic balance updates
  - ✓ Transaction history
  - ✓ Multi-currency support
- Plaid Link integration button
- Security badge: "Bank-level encryption • Read-only access"
- List of connected accounts (if any)
- Skip option

**Visual Elements:**

- Animated bank/vault icon
- Connected accounts show with bank logos
- Success state with checkmark animation

**Image Placeholder & AI Prompt:**

```
[PLACEHOLDER: banking-illustration.png]
AI Image Generation Prompt:
"Minimalist illustration of banking security concept. Dark background (#0a0a0f).
A stylized bank vault door or shield icon with subtle gold (#D4AF37) accents.
Clean line art style, no text. Premium financial app aesthetic. Abstract
geometric shapes suggesting security and trust. 4K, vector art style."
```

---

### Step 4: Connect Brokers (Recommended, Skippable)

**Purpose:** Link brokerage accounts via SnapTrade.

**Content:**

- Headline: "Connect Your Investment Accounts"
- Subheadline: "Import your stocks, ETFs, and bonds automatically"
- Benefits list:
  - ✓ Real-time portfolio updates
  - ✓ Support for 15+ brokerages
  - ✓ Dividend tracking
- SnapTrade Link button
- Supported brokers logos (Interactive Brokers, Fidelity, Schwab, etc.)
- Connected accounts list
- Skip option

**Visual Elements:**

- Animated stock chart icon
- Broker logos in a subtle grid
- Connection status indicators

**Image Placeholder & AI Prompt:**

```
[PLACEHOLDER: brokers-illustration.png]
AI Image Generation Prompt:
"Minimalist illustration of stock market/investment concept. Dark background
(#0a0a0f). Abstract rising line chart with subtle blue (#3B82F6) glow effect.
Small floating geometric shapes representing different assets. Clean, modern,
premium financial app style. No text. 4K, vector art aesthetic."
```

---

### Step 5: Connect Crypto (Recommended, Skippable)

**Purpose:** Link cryptocurrency accounts via Vezgo.

**Content:**

- Headline: "Connect Your Crypto Wallets"
- Subheadline: "Track Bitcoin, Ethereum, and 100+ other assets"
- Benefits list:
  - ✓ Exchange connections (Coinbase, Binance, Kraken)
  - ✓ Wallet support (MetaMask, Ledger)
  - ✓ DeFi position tracking
- Vezgo Connect button
- Supported platforms logos
- Connected accounts list
- Skip option

**Visual Elements:**

- Animated crypto/blockchain icon
- Exchange logos in subtle grid
- Connection status with chain animations

**Image Placeholder & AI Prompt:**

```
[PLACEHOLDER: crypto-illustration.png]
AI Image Generation Prompt:
"Minimalist illustration of cryptocurrency/blockchain concept. Dark background
(#0a0a0f). Abstract geometric hexagon pattern suggesting blockchain. Subtle
gold (#D4AF37) Bitcoin symbol or coin element. Clean lines, premium fintech
aesthetic. No text. Glowing edges effect. 4K, modern vector art style."
```

---

### Step 6: Completion & Dashboard Preview (Mandatory)

**Purpose:** Celebrate completion, show immediate value, drive to dashboard.

**Content:**

- Headline: "You're All Set! 🎉"
- Subheadline: "Your wealth dashboard is ready"
- Summary of what was connected:
  - "X bank accounts connected"
  - "X brokerage accounts connected"
  - "X crypto wallets connected"
  - Or "Complete your setup anytime in Settings" if skipped
- Animated preview of their dashboard (real data if available, demo if not)
- Primary CTA: "Go to Dashboard"
- Secondary: "Add More Accounts"

**Visual Elements:**

- Confetti animation on load (subtle, gold particles)
- Dashboard preview with glass card
- Pulsing CTA button

---

## Component Architecture

```
frontend/
├── app/
│   └── (onboarding)/
│       ├── layout.tsx              # Onboarding-specific layout (no sidebar)
│       └── onboarding/
│           └── page.tsx            # Main onboarding page (client component)
│
├── components/
│   └── atomic/
│       └── organisms/
│           └── onboarding/
│               ├── index.ts                    # Barrel export
│               ├── OnboardingFlow.tsx          # Main orchestrator component
│               ├── OnboardingProgress.tsx      # Progress indicator
│               ├── OnboardingStep.tsx          # Reusable step wrapper
│               ├── steps/
│               │   ├── WelcomeStep.tsx         # Step 1
│               │   ├── ProfileStep.tsx         # Step 2
│               │   ├── BankingStep.tsx         # Step 3
│               │   ├── BrokersStep.tsx         # Step 4
│               │   ├── CryptoStep.tsx          # Step 5
│               │   └── CompletionStep.tsx      # Step 6
│               └── shared/
│                   ├── OnboardingCard.tsx      # Glass card component
│                   ├── FeatureItem.tsx         # Benefit list item
│                   ├── ConnectionCard.tsx      # Connected account card
│                   ├── SkipButton.tsx          # Skip step button
│                   └── AnimatedBackground.tsx  # Particle/gradient bg
│
├── convex/
│   ├── onboarding.ts               # Onboarding-specific mutations/queries
│   └── schema.ts                   # Extended with onboardingProgress
│
├── hooks/
│   └── convex/
│       └── onboarding.ts           # Onboarding data hooks
│
└── lib/
    └── types/
        └── onboarding.ts           # TypeScript types
```

---

## Convex Schema Extensions

```typescript
// Add to schema.ts

// Track onboarding progress per user
onboardingProgress: defineTable({
  userId: v.string(),                           // Clerk user ID
  currentStep: v.number(),                      // 1-6
  completedSteps: v.array(v.number()),          // [1, 2, 3]
  skippedSteps: v.array(v.number()),            // [3, 4]
  profileCompleted: v.boolean(),
  bankingConnected: v.boolean(),
  brokersConnected: v.boolean(),
  cryptoConnected: v.boolean(),
  onboardingCompleted: v.boolean(),             // True when reached step 6
  completedAt: v.optional(v.number()),          // Timestamp
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_user", ["userId"]),
```

---

## Animation Guidelines

### Page Transitions

```typescript
// Use Framer Motion variants
const pageVariants = {
  initial: { opacity: 0, x: 100 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -100 },
};

const pageTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};
```

### Stagger Children

```typescript
const containerVariants = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
};
```

### Micro-interactions

- Button hover: Scale 1.02, subtle shadow increase
- Input focus: Border glow with accent color
- Success states: Checkmark with spring animation
- Skip button: Subtle opacity change

---

## Responsive Design

### Breakpoints

- Mobile: < 640px — Single column, full-width cards
- Tablet: 640px - 1024px — Centered content, max-width 600px
- Desktop: > 1024px — Split view (illustration left, form right)

### Mobile Considerations

- Touch targets minimum 44px
- Bottom-fixed CTA buttons
- Swipe gestures for navigation (optional)
- Reduced animations on preference

---

## Accessibility

- Full keyboard navigation
- ARIA labels on all interactive elements
- Focus trapping in connection modals
- Color contrast ratios > 4.5:1
- Screen reader announcements for step changes
- Reduced motion support via `prefers-reduced-motion`

---

## Security Considerations

- No sensitive data stored in onboarding state
- Connection tokens handled server-side (Convex actions)
- Plaid/SnapTrade/Vezgo handle credentials
- HTTPS enforced
- Rate limiting on connection attempts

---

## Analytics Events

Track the following for funnel optimization:

- `onboarding_started`
- `onboarding_step_viewed` (step number)
- `onboarding_step_completed` (step number)
- `onboarding_step_skipped` (step number)
- `onboarding_connection_started` (type: banking/broker/crypto)
- `onboarding_connection_success` (type)
- `onboarding_connection_failed` (type, error)
- `onboarding_completed`
- `onboarding_abandoned` (last step)

---

## Implementation Priority

### Phase 1: Core Flow (MVP)

1. Layout and routing setup
2. OnboardingFlow orchestrator
3. WelcomeStep with basic animations
4. ProfileStep with Convex integration
5. CompletionStep

### Phase 2: Financial Connections

6. BankingStep with Plaid integration
7. BrokersStep with SnapTrade integration
8. CryptoStep with Vezgo integration

### Phase 3: Polish

9. Advanced animations and transitions
10. Responsive refinements
11. Accessibility audit
12. Analytics integration

---

## Testing Strategy

- Unit tests for form validation
- Integration tests for Convex mutations
- E2E tests for full flow (Playwright)
- Visual regression tests (Chromatic)
- Accessibility tests (axe-core)

---

_Document Version: 1.0_
_Last Updated: 2026-01-31_
