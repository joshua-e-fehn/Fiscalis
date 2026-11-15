# ADR 0002: Teams and workspaces

- **Status:** Accepted (owner decision 2026-11-15: build it as a Pro feature)
- **Tracking:** ENG-197 (parent ENG-178, placeholder menu items)
- **Delivered in three stacked PRs:** (1) this ADR, schema, membership and
  invites, GDPR handling; (2) read-only team aggregate queries; (3) the
  sidebar workspace switcher, Settings > Team and the join page.

## Context

The sidebar has carried a disabled "Settings > Team" entry since the
placeholder menu was built (ENG-178), and the sample team switcher was
removed in #60. The use case is a household that wants to see one shared
net worth: two partners, each with their own bank, broker and crypto
connections, looking at the sum.

Everything a user owns carries a `userId`, and every public function checks
it (lib/auth.ts `getOwnedDoc`, the ENG-237 ownership harness). The GDPR
export and purge (ENG-232) walk the same `userId` tables. A design that
moved data into team ownership would touch every table, every check and
the GDPR code; it would also make "who may delete this loan" ambiguous.

## Decision

### Data stays user-owned

No ownership migration. `userId` on every existing table is unchanged and
keeps meaning "the only person who may change this". A team grants its
members **read** access, and only to the data of members who opted in.

### Tables (Convex-native)

| Table | Fields | Indexes |
|---|---|---|
| `teams` | `userId` (current owner), `name`, `createdAt`, `updatedAt` | `by_user` |
| `teamMembers` | `teamId`, `userId`, `role` (`owner`/`admin`/`member`), `displayName`, `sharing`, `joinedAt` | `by_user`, `by_team`, `by_team_user` |
| `teamInvites` | `teamId`, `userId` (inviter), `tokenHash`, `role` (`admin`/`member`), `createdAt`, `expiresAt` | `by_user`, `by_team`, `by_token_hash` |

The owner is both `teams.userId` and the member with role `owner`;
`lib/teams.ts transferOwnership` is the one place that changes them, and it
changes both. Field names follow the remap rule (clerkUserIdRemap.test.ts):
every Clerk id is stored as `userId`, so a Clerk id remap moves teams too.

### Clerk Organizations vs Convex-native membership

Clerk Organizations (available on the free plan of the production instance)
were evaluated and **not used**:

- The Convex functions would have to trust organization membership from the
  token, which means adding `org_id`/`org_role` claims to the `convex` JWT
  template and following the active organization in `auth.config.ts`. Both
  are out of bounds (auth config and keys stay as they are).
- Without the claims, every membership check would be a Clerk Backend API
  call from an action, which queries cannot make and which is not reactive.
- Clerk has one *active* organization per session; a member who reads two
  teams would switch sessions, while a Convex table lets the sidebar switch
  with a query argument.

Membership therefore lives in `teamMembers`, invites in `teamInvites`, and
`ctx.auth` stays the only identity source.

### Roles

| Action | owner | admin | member |
|---|---|---|---|
| View the team aggregate | yes | yes | yes |
| Share / stop sharing own data | yes | yes | yes |
| Create invite links | yes (admin or member) | yes (member only) | no |
| Revoke invites | yes | yes | no |
| Remove a member | anyone but self | plain members | no |
| Change roles, transfer ownership | yes | no | no |
| Rename / delete the team | yes | no | no |
| Leave | no (transfer or delete first) | yes | yes |

Rules: `services/teams/teams.ts`, tested in `teams.test.ts`.

### Sharing is opt-in and revocable

Every membership starts with `sharing: false`, the creator's included. A
member turns it on per team (Settings > Team) and off at any time; queries
are reactive, so the other members stop seeing the data at once. A member
who does not share can still view the members who do: sharing is consent
about one's own data, not a price for viewing.

### Read path: a separate helper, owner checks untouched

`lib/teams.ts readableTeamMembers(ctx, viewerId, teamId)` throws
`teamNotFound` unless the viewer is a member, then returns the sharing
members. The team aggregate queries (`teamViews.ts`, PR 2) take a `teamId`,
call it, and run the existing loaders (`lib/netWorth.ts loadHoldings`, the
snapshot index) once per sharing member. Every row carries its owner's
member id and display name. No existing query gains a `teamId`; no
`getOwnedDoc` / `userId` check is loosened. Team rows carry no
classification or valuation edit handles, and every mutation still checks
the caller owns the document, so a member cannot change another member's
data even by calling the API directly (tested).

### Invites are links, not emails

Email is off until Resend is set up, so an invite is a link the inviter
copies from Settings > Team. The token (`fti_` + 32 CSPRNG bytes, made in an
action) is shown once; only its SHA-256 is stored (as API keys). It sits in
the URL fragment (`/settings/team/join#fti_…`), which browsers do not send
to servers or log. A link works once and for seven days; a team has at most
10 open invites and 10 members; a user owns at most 5 teams.

### Pro gate

`teams` is a plan feature (`services/billing/plans.ts`). Creating a team
needs the creator's Pro; creating an invite needs the **team owner's** Pro
(an admin on Free may invite into a Pro owner's team). Joining needs no
plan, so a partner on Free can join a household. If the owner drops to
Free, the team keeps working read-only but no new invites can be made.

### GDPR

All three tables are in `USER_DATA_TABLES` (export and purge); the export
leaves out `teamInvites.tokenHash`. On account deletion
(`account.ts purgeUserData`, first batch) every team the user owns is
handed to its longest-standing admin, else member (`pickSuccessor`), or
deleted with its invites when the user was alone. The regular purge then
removes the user's memberships and the invites they created. Other
members' data is never touched: it was never the team's.

### Workspace switcher (PR 3)

A "Workspace" menu at the top of the sidebar, next to the brand, lists
"Personal" and each team (`teams:listMyTeams`). The choice is kept per
browser (localStorage) and validated against the list. In a team workspace
the dashboard, net worth, category pages, snapshot charts and positions
read the `teamViews` queries and show a read-only banner and owner labels;
editing controls are hidden. Everything else (integrations, loans editor,
vault, settings) stays personal.

## Consequences

- Reads in a team workspace cost one loader run per sharing member (at most
  10); acceptable for households, revisit if teams grow.
- Snapshot histories of members are written at different times; the team
  series takes, per day, each member's latest snapshot on or before it
  (carried forward), so a day is never missing a member who has history.
- A member sees other members' display names (from their Clerk profile at
  join time), never their Clerk ids or emails beyond the local part used as
  a fallback name.
