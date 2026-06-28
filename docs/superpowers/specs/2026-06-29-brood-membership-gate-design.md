# Member-Centric Access (People × Access merge) — Design

**Date:** 2026-06-29
**Status:** Approved (pending spec review)
**Supersedes:** the earlier brood-centric draft of this file.

## Problem

Admin access management is split across two tabs of `/admin/broods`:

- **People** tab — `UsersTable` (approve/role/status) + `InviteForm`.
- **Access** tab — `BroodAccessPanel`, brood-centric: pick a brood, set
  column rules (mode ALL/INCLUDE/EXCLUDE over users).

Brood visibility is only *implied* (a shared brood shows to anyone who can see
≥1 column, and to all admins). There is no explicit "who is in this brood,"
and access is awkward to reason about per person.

We want **one member-centric page**: each member's row expands to show the
broods they belong to and, per brood, their column access. Two permission
levels: **brood membership** (a hard gate), then **per-column access** within it.

## Goals

1. Merge the People and Access tabs into a single member-centric **People** tab.
   Remove the brood-centric `BroodAccessPanel`.
2. Each member row expands to a brood list. Level 1: toggle brood membership.
   Level 2: per-column access for that member.
3. Brood membership is a **hard gate** — non-members see nothing of the brood
   in the app.
4. Keep the existing `FieldAccessMode` model (Brood Member / Only these /
   Everyone except); the per-member checkbox edits the column's user list, with
   server-side auto-conversion between modes.

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Page merge | **Replace both tabs with one** member-centric People tab; drop Access tab + `BroodAccessPanel`. |
| Column model | **Keep `FieldAccessMode`**; per-member checkbox edits the column's include/exclude list. |
| Where mode is set | **Inline per column** in the member view (mode selector is column-global; editable from any member's row). |
| ALL-mode cell uncheck | **Auto-convert**: unchecking flips the column to EXCLUDE and adds that member to the exclude list. |
| Empty exclude list | **Auto-revert to Brood Member (ALL)** when the last excluded user is re-checked. |
| Save model | **Instant optimistic** per toggle/checkbox/mode; revert on server error. |
| Gate | **Hard gate** — membership filters first; column rules apply only among members. |
| Admin viewing | **Admins gated in-app** — must be a brood member to see a brood; but once a member, keep the **all-columns bypass** within that brood. |
| Admin management | **People page is admin-only and shows all members × all shared broods**, regardless of the admin's own membership. |
| Backfill on deploy | **Start empty** — no backfill; every brood invisible until membership set. |

## Data Model

No new tables. The existing, currently-unused `BroodMember` model is the gate:

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

`Tab.members` and `User.broodMemberships` back-relations already declared.
Action item: run `db:push` so the table exists (currently empty/unmigrated).
Start-empty → no seed step. Personal broods (`ownerId != null`) ignore
membership (still owner-only) and never appear in the People grid.

## Access Logic — `src/lib/access.ts`

### `getTabsWithFields` (cache)
Add members to the include so the gate can read them:

```ts
include: {
  fields: { /* unchanged: orderBy + access userId */ },
  members: { select: { userId: true } },
}
```

`TabWithFields` type gains `members: { userId: string }[]`.

### `broodVisibleTo(user, tab)` — the gate (rewritten)

```ts
function broodVisibleTo(user: SessionUser, tab: TabWithFields): boolean {
  if (tab.ownerId) return tab.ownerId === user.id;       // personal: owner-only
  return tab.members.some((m) => m.userId === user.id);  // shared: members only
}
```

The blanket `if (isAdmin(user)) return true;` is **removed** — admins must be
members to see a shared brood in the app.

### `getVisibleFields(user, tabId)` — unchanged
Already early-returns `[]` when `!broodVisibleTo(...)`. Past the gate, the
existing `effectiveAdmin = isAdmin(user) || tab.ownerId === user.id` keeps the
all-columns bypass — reached only when the admin is already a member. Net:
admins see all columns of broods they belong to; non-member admins see nothing.

### Other consumers
`getVisibleTabs`, `canAccessTab`, `getNavForUser` delegate to `broodVisibleTo` /
`getVisibleFields` — inherit the gate, no change.

## Server Actions — `src/app/(app)/admin/actions.ts`

All `requireAdmin()`; all call `revalidateAccess(tabId)` (already refreshes nav
`/`, `/archive`, `/tab/[id]`, `/admin/broods`). Granular for optimistic UI.

### `setBroodMembership(tabId, userId, isMember)`

```ts
export async function setBroodMembership(
  tabId: string, userId: string, isMember: boolean,
) {
  await requireAdmin();
  if (isMember) {
    await prisma.broodMember.upsert({
      where: { tabId_userId: { tabId, userId } },
      create: { tabId, userId },
      update: {},
    });
  } else {
    await prisma.broodMember.deleteMany({ where: { tabId, userId } });
  }
  revalidateAccess(tabId);
}
```

### `setColumnMode(fieldId, mode)` — inline mode selector
Sets `FieldDef.accessMode`. On `ALL`, clears the `FieldAccessUser` list;
INCLUDE/EXCLUDE keep the existing list. (Thin wrapper over the existing
`setFieldAccess` shape.)

### `setMemberColumnAccess(fieldId, userId, canView)` — the checkbox
Single source of truth for the auto-conversion. Reads the field's current mode +
user list, computes the new (mode, list) so that this member's effective
visibility equals `canView`:

| Current mode | canView=true | canView=false |
|---|---|---|
| ALL | no-op (already sees) | → EXCLUDE, add userId to list |
| INCLUDE | add userId | remove userId |
| EXCLUDE | remove userId; **if list now empty → ALL** | add userId |

Then persists mode + list (reusing the `setFieldAccess` transaction pattern:
update `FieldDef.accessMode`, delete + recreate `FieldAccessUser` rows) and
`revalidateAccess`.

### `getBroodAccessConfig` — extend
Add `members: { select: { userId: true } }` to the tab select; return
`members: string[]` per brood (alongside existing `fields[].accessMode` +
`userIds`). Feeds the People grid.

## UI

### `admin-sections.tsx`
- `SECTIONS`: drop `{ key: "access" }`. Now `Broods | People | WhatsApp`.
- Remove the `access` branch and the `BroodAccessPanel` import.
- **People** branch renders `InviteForm` + the new member-centric `UsersTable`,
  now also passed the access data: `accessBroods` (broods with columns: id,
  label, accessMode, userIds, + brood `members`) and the approved-user list.
- `BroodAccessPanel` component file deleted.

### `users-table.tsx` — expandable member rows
Each `<tr>` gains a chevron toggle. Expanded, an inner panel (`MemberAccess`)
shows, per shared brood:

- **Membership toggle** (level 1) — checkbox/switch bound to
  `accessBroods[b].members.includes(user.id)`; calls
  `setBroodMembership(b.id, user.id, next)` optimistically.
- When the member is in the brood, a **column list** (level 2): for each column
  `{ label, mode selector, sees-checkbox }`.
  - **Mode selector** — `Select` over ALL/INCLUDE/EXCLUDE with the labels
    `Brood Member / Only these / Everyone except`; calls `setColumnMode`.
    Subtle hint that the mode is brood-wide (affects all members).
  - **Sees-checkbox** — effective visibility for this member, derived client-side
    from `(mode, userIds, user.id)` via the same logic as `fieldVisible`; calls
    `setMemberColumnAccess(fieldId, user.id, next)`.
- When not a member, columns are hidden (collapsed).

State: optimistic via `useTransition` + local mirror of `accessBroods`, re-seeded
on revalidate (same re-seed pattern already used in `RuleEditor`/`NicknameEditor`).
Server actions remain the single source of truth for mode auto-conversion; the
client only needs the derived checkbox state for display.

### Labels
`Brood Member / Only these / Everyone except` (replaces `Everyone / Only these
people / Everyone except`).

## Edge Cases

- **Empty membership** (default on deploy): brood invisible to everyone in the
  app including admins; admins populate via the People page (always open).
- **Remove a member** who appears in a column's include/exclude list: their
  `FieldAccessUser` rows are left in place (inert — the gate blocks them). Not
  cleaned up (YAGNI).
- **ALL→EXCLUDE auto-convert** then re-check the same member: EXCLUDE list
  empties → auto-revert to ALL. Round-trips cleanly.
- **Mode change is global**: editing a column's mode from member A's row changes
  it for everyone; revalidate refreshes other rows' derived checkboxes.
- **Concurrent edits** on the same column from two member rows: last write wins
  (acceptable for admin-only tooling).
- **Personal broods**: never in the grid; owner-only, unaffected.

## Out of Scope

- Backfilling existing implied visibility into membership.
- Cleaning up orphaned `FieldAccessUser` rows.
- Member-facing self-service (self-join, requests) — admin-set only.
- Bulk operations (add user to many broods at once).

## Files Touched

| File | Change |
|---|---|
| `prisma/schema.prisma` | `BroodMember` already present — `db:push` only. |
| `src/lib/access.ts` | `getTabsWithFields` include members; rewrite `broodVisibleTo`; `getBroodAccessConfig` returns members; types. |
| `src/app/(app)/admin/actions.ts` | New `setBroodMembership`, `setColumnMode`, `setMemberColumnAccess`. |
| `src/components/admin/users-table.tsx` | Expandable rows + `MemberAccess` panel (membership toggle, column mode + checkbox), optimistic saves. |
| `src/components/admin/admin-sections.tsx` | Drop Access tab; pass access data into People; remove `BroodAccessPanel` usage. |
| `src/app/(app)/admin/broods/page.tsx` | Pass access config into the People section instead of the Access section. |
| `src/components/admin/brood-access-panel.tsx` | **Deleted.** |
