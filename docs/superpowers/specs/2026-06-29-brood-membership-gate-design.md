# Brood Membership Gate — Design

**Date:** 2026-06-29
**Status:** Approved (pending spec review)

## Problem

The Access page currently controls visibility **column by column** only. Brood
(`Tab`) visibility is *implied*: a shared brood is visible to anyone who can see
≥1 of its columns, and to every admin. There is no way to say "these people are
in this brood, nobody else."

We want explicit, brood-level membership that acts as a **hard gate**, with
column permissions operating *within* the member set.

## Goals

1. Admin can set, per brood, **who is a member** (a listbox/pill toggle of
   approved users).
2. Membership is a **hard gate**: a non-member sees nothing of the brood in the
   app — regardless of column rules.
3. Column permissions still exist, one level below membership, scoped to members.
4. The column mode formerly labeled **"Everyone"** becomes **"Brood Member"** —
   meaning all brood members may view the column (no non-members ever can).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Gate model | **Hard gate** — membership filters first; column rules apply only among members. |
| Admin viewing | **Admins are gated too** — must be a brood member to see the brood in the app. |
| Admin management | **Admin panel stays open** — admins manage membership/permissions for all shared broods even when not a member. |
| Backfill on deploy | **Start empty** — no backfill; every brood invisible until membership set. |
| Column pill pool | **Saved members only** — Include/Exclude pills draw from last-saved membership. |
| Non-member admin in app | **Brood fully hidden.** |

## Data Model

No new tables. The `BroodMember` model already exists in `prisma/schema.prisma`
but is unused:

```prisma
model BroodMember {
  id     String @id @default(cuid())
  tabId  String
  userId String
  brood  Tab    @relation(fields: [tabId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([tabId, userId])
  @@index([tabId])
  @@index([userId])
}
```

`Tab.members BroodMember[]` and `User.broodMemberships BroodMember[]` back-relations
already declared. Action item: run `db:push` so the table exists in the DB
(currently empty/unmigrated). Start-empty means no seed step.

Personal broods (`ownerId != null`) ignore membership entirely — still owner-only.

## Access Logic — `src/lib/access.ts`

### `getTabsWithFields` (cache)
Add members to the include:

```ts
include: {
  fields: { /* unchanged */ },
  members: { select: { userId: true } },
}
```

`TabWithFields` type gains `members: { userId: string }[]`.

### `broodVisibleTo(user, tab)` — the gate
Replace the current body:

```ts
function broodVisibleTo(user: SessionUser, tab: TabWithFields): boolean {
  if (tab.ownerId) return tab.ownerId === user.id;       // personal: owner-only
  return tab.members.some((m) => m.userId === user.id);  // shared: members only
}
```

Notable: the blanket `if (isAdmin(user)) return true;` is **removed**. Admins must
be members to see a shared brood in the app. This is the hard gate.

### `getVisibleFields(user, tabId)`
Unchanged in structure. It already early-returns `[]` when
`!broodVisibleTo(...)`, so non-members get no columns. Past the gate, the
existing `effectiveAdmin = isAdmin(user) || tab.ownerId === user.id` keeps the
all-columns bypass — but only ever reached when the admin **is** a member
(gate guarantees it). Net: admin power is scoped to broods they joined.

Column `ALL` (now "Brood Member") needs no logic change: the gate already
removed non-members, so "all who reach here" = brood members.

### Other consumers
`getVisibleTabs`, `canAccessTab`, `getNavForUser` all delegate to
`broodVisibleTo` / `getVisibleFields` — no change needed; they inherit the gate.

## Server Actions — `src/app/(app)/admin/actions.ts`

### New: `setBroodMembers(tabId, userIds[])`

```ts
export async function setBroodMembers(tabId: string, userIds: string[]) {
  await requireAdmin();
  const valid = (
    await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true },
    })
  ).map((u) => u.id);

  await prisma.$transaction([
    prisma.broodMember.deleteMany({ where: { tabId } }),
    ...valid.map((userId) =>
      prisma.broodMember.create({ data: { tabId, userId } }),
    ),
  ]);
  revalidateAccess(tabId);
}
```

Mirrors `setBroodAccess`'s replace-all pattern. `revalidateAccess` already
refreshes nav (`/`, `/archive`, `/tab/[id]`, `/admin/broods`).

### `getBroodAccessConfig` — add members
Add `members: { select: { userId: true } }` to the tab select; return
`members: t.members.map((m) => m.userId)` per brood. `BroodAccess` type gains
`members: string[]`.

## UI — `src/components/admin/brood-access-panel.tsx`

Per-brood expander gets two stacked sections:

```
┌ Brood name  (N columns) ───────────────────┐
│  MEMBERSHIP                                  │  ← new, top
│  Who is in this brood.                       │
│  [pill toggles of ALL approved users] [Save] │
│ ───────────────────────────────────────────  │  ← divider
│  Whole brood   [Brood Member ▾]       [Save]  │  ← existing column rules
│  Column A      [Brood Member ▾]       [Save]  │
│  Column B      [Only these ▾] [member pills]  │
└──────────────────────────────────────────────┘
```

### Membership editor (new component, `MembershipEditor`)
- Props: `users: UserOpt[]` (all approved), `initialMemberIds: string[]`,
  `onSave(ids) => Promise`.
- Reuses the existing pill-toggle pattern from `RuleEditor` (same styling).
- Same dirty-tracking + re-seed-on-revalidate logic as `RuleEditor`.
- `onSave` calls `setBroodMembers(b.id, ids)`.

### `BroodAccessPanel` wiring
- `Brood` type gains `members: string[]`.
- Render `<MembershipEditor>` above the "Whole brood" `RuleEditor`, then the
  existing divider, then the column `RuleEditor`s.
- Pass `users={members}` (filtered to current saved members) into the column
  `RuleEditor`s — **not** the full approved list. Compute
  `const memberUsers = users.filter(u => b.members.includes(u.id))`.
  The full `users` list stays only on the `MembershipEditor`.

### Label change
`MODE_LABEL.ALL`: `"Everyone"` → `"Brood Member"`.

### Pill pool = saved members only
The column `RuleEditor` receives `memberUsers` derived from `b.members` (server
state). Editing membership and saving triggers revalidate → new `b.members` →
column pills update on the refreshed render. No live unsaved cross-section sync.

## Edge Cases

- **Remove a member** who was in a column Include list: their `FieldAccessUser`
  rows are left in place (harmless — the gate blocks them). Not cleaned up (YAGNI).
- **Empty membership** (default for all broods on deploy): brood invisible to
  everyone in the app, including admins; admins populate via the still-open panel.
- **Member in Include list later removed from brood**: column pill no longer
  shows them (pool = members); their stale rule row is inert.
- **Personal broods**: unaffected — never appear in the admin panel, owner-only.

## Out of Scope

- Backfilling existing visibility into membership.
- Cleaning up orphaned `FieldAccessUser` rows.
- Member-facing UI (self-join, requests) — admin-set only.
- Live unsaved sync between membership and column pill pools.

## Files Touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `BroodMember` already present — `db:push` only. |
| `src/lib/access.ts` | `getTabsWithFields` include members; rewrite `broodVisibleTo`; `getBroodAccessConfig` returns members; types. |
| `src/app/(app)/admin/actions.ts` | New `setBroodMembers`. |
| `src/components/admin/brood-access-panel.tsx` | `MembershipEditor`, wiring, label, member-pool filter, types. |
