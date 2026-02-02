# Integration Pages Unification Plan

Unify the design of Banking, Brokers, and Crypto integration pages while preserving page-specific features.

---

## Phase 1: Create Shared Components ✅

**Location:** `components/atomic/molecules/integrations/`

### Task 1.1: IntegrationStatusBadge ✅

- [x] Create unified status badge component
- [x] Support statuses: `connected`, `syncing`, `error`, `reauth_required`, `pending`, `disconnected`
- [x] Consistent colors and icons across all pages
- [x] Accept `isSyncing` prop to override status (for global sync context)

### Task 1.2: IntegrationConnectionMenu ✅

- [x] Create three-dot dropdown menu component
- [x] Include "Sync" and "Disconnect" options
- [x] Include AlertDialog for disconnect confirmation
- [x] Support loading states for sync/delete operations

### Task 1.3: IntegrationAccountItem ✅

- [x] Create nested account/position item component
- [x] Props: name, type, balance, currency, masked account number (optional)
- [x] Consistent padding, borders, typography

### Task 1.4: IntegrationConnectionCard ✅

- [x] Create main connection card component
- [x] Props: logo, name, totalValue, currency, status, lastSyncAt, errorMessage
- [x] Slots: children (for nested accounts), headerExtra (for custom badges)
- [x] Compose with IntegrationStatusBadge and IntegrationConnectionMenu
- [x] Accept `isSyncing` prop for global sync state display

### Task 1.5: IntegrationEmptyState ✅

- [x] Create empty state component for when no connections exist
- [x] Props: icon, title, description, children (connect button slot)
- [x] Include relevant icon and helpful messaging

### Task 1.6: Index Export ✅

- [x] Create `index.ts` barrel export for all components

---

## Phase 2: Refactor Banking Page

### Task 2.1: Update BanksCard

- [ ] Replace current card implementation with IntegrationConnectionCard
- [ ] Keep account grouping by institution
- [ ] Use IntegrationAccountItem for individual bank accounts
- [ ] Ensure disconnect confirmation dialog works

### Task 2.2: Update Banking Page

- [ ] Keep existing PageHeader
- [ ] Use IntegrationEmptyState when no connections
- [ ] Verify sync functionality works with new components

---

## Phase 3: Refactor Brokers Page

### Task 3.1: Update BrokerAccountsCard

- [ ] Replace with IntegrationConnectionCard
- [ ] Keep account grouping by broker
- [ ] Use IntegrationAccountItem for broker accounts
- [ ] Port existing disconnect confirmation pattern

### Task 3.2: Update Brokers Page

- [ ] Keep existing PageHeader
- [ ] Use IntegrationEmptyState when no connections
- [ ] Verify SnapTrade reconnect flow still works

---

## Phase 4: Refactor Crypto Page

### Task 4.1: Update CryptoConnectionsCard

- [ ] Replace with IntegrationConnectionCard
- [ ] Keep exchange type indicator (CEX/wallet/blockchain)
- [ ] Verify disconnect confirmation works

### Task 4.2: Update Crypto Page

- [ ] Keep existing PageHeader
- [ ] **Keep tab navigation** (Overview/Connections)
- [ ] **Keep overview cards** on Overview tab
- [ ] Use IntegrationEmptyState in Connections tab when empty
- [ ] Ensure Vezgo connect button placement is intuitive

---

## Phase 5: Polish & Consistency Check

### Task 5.1: Visual Audit

- [ ] Compare all three pages side-by-side
- [ ] Verify consistent spacing, typography, colors
- [ ] Check responsive behavior on mobile

### Task 5.2: Interaction Audit

- [ ] Test sync on all pages
- [ ] Test disconnect with confirmation on all pages
- [ ] Test empty states on all pages
- [ ] Test error states display consistently

### Task 5.3: Cleanup

- [ ] Remove deprecated components if fully replaced
- [ ] Update any imports throughout codebase
- [ ] Remove unused code

---

## Component Props Reference

```tsx
// IntegrationConnectionCard
interface IntegrationConnectionCardProps {
  logo?: string;
  name: string;
  status: "connected" | "syncing" | "error" | "reauth_required" | "pending";
  totalValue: number;
  currency: string;
  lastSyncAt?: number;
  errorMessage?: string;
  secondaryInfo?: string; // "3 accounts", "5 positions"
  onSync: () => void;
  onDisconnect: () => void;
  isSyncing?: boolean;
  isDeleting?: boolean;
  children?: React.ReactNode; // Nested accounts
}

// IntegrationAccountItem
interface IntegrationAccountItemProps {
  name: string;
  type?: string;
  accountNumber?: string; // masked
  balance: number;
  currency: string;
  icon?: React.ReactNode;
}

// IntegrationEmptyState
interface IntegrationEmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode; // Connect button
}
```

---

## Notes

- Each page keeps its own PageHeader (different icons, titles, connect buttons)
- Banking: accounts nested under institution
- Brokers: accounts nested under broker connection
- Crypto: keeps tabs + overview, connections tab uses shared design
- All disconnect actions require confirmation dialog
- All pages show helpful empty state when no connections
