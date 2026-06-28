# Member-Centric Access (People × Access merge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Merge the admin People and Access tabs into one member-centric page where each member row expands to toggle brood membership (a hard visibility gate) and per-column access.

**Architecture:** Reuse the existing `BroodMember` table as a hard gate in `access.ts`. Keep the `FieldAccessMode` (ALL/INCLUDE/EXCLUDE) column model; a pure helper module computes per-member checkbox state and auto-converts modes when a member is toggled. Three new server actions persist edits; `UsersTable` rows gain an expandable access panel with optimistic UI. The brood-centric `BroodAccessPanel` is deleted.

**Tech Stack:** Next.js 16, React 19, Prisma 6, Vitest, Tailwind v4, framer-motion.

**Spec:** `docs/superpowers/specs/2026-06-29-brood-membership-gate-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/brood-access.ts` | **New.** Pure (prisma-free) helpers + shared types: `memberSeesColumn`, `applyMemberColumnAccess`, `UserOpt`, `AccessField`, `AccessBrood`. Imported by server and client. |
| `src/lib/brood-access.test.ts` | **New.** Vitest unit tests for the two pure helpers. |
| `src/lib/access.ts` | Gate logic: load members, rewrite `broodVisibleTo`, delegate `fieldVisible` to the helper, return `members` from `getBroodAccessConfig`. |
| `src/app/(app)/admin/actions.ts` | New server actions: `setBroodMembership`, `setColumnMode`, `setMemberColumnAccess`. |
| `src/components/admin/users-table.tsx` | Expandable member rows + `MemberAccess` panel (membership toggle, column mode, sees-checkbox), optimistic saves. |
| `src/components/admin/admin-sections.tsx` | Drop the Access tab; route access data into the People section. |
| `src/app/(app)/admin/broods/page.tsx` | Import shared types from `@/lib/brood-access`; pass `accessBroods` into People. |
| `src/components/admin/brood-access-panel.tsx` | **Deleted.** |
| `prisma/schema.prisma` | Fix the misleading `BroodMember` comment (empty = nobody, not everyone). |

---

## Task 1: Pure access helpers + tests (TDD)

**Files:**
- Create: `src/lib/brood-access.ts`
- Test: `src/lib/brood-access.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/brood-access.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { memberSeesColumn, applyMemberColumnAccess } from "./brood-access";

describe("memberSeesColumn", () => {
  it("ALL: everyone sees it", () => {
    expect(memberSeesColumn("ALL", [], "u1")).toBe(true);
  });
  it("INCLUDE: only listed users see it", () => {
    expect(memberSeesColumn("INCLUDE", ["u1"], "u1")).toBe(true);
    expect(memberSeesColumn("INCLUDE", ["u1"], "u2")).toBe(false);
  });
  it("EXCLUDE: everyone except listed users sees it", () => {
    expect(memberSeesColumn("EXCLUDE", ["u1"], "u1")).toBe(false);
    expect(memberSeesColumn("EXCLUDE", ["u1"], "u2")).toBe(true);
  });
});

describe("applyMemberColumnAccess", () => {
  it("ALL + hide -> EXCLUDE [user]", () => {
    expect(applyMemberColumnAccess("ALL", [], "u1", false)).toEqual({
      mode: "EXCLUDE",
      userIds: ["u1"],
    });
  });
  it("ALL + show -> stays ALL, empty list", () => {
    expect(applyMemberColumnAccess("ALL", [], "u1", true)).toEqual({
      mode: "ALL",
      userIds: [],
    });
  });
  it("INCLUDE + show adds the user (no duplicate)", () => {
    expect(applyMemberColumnAccess("INCLUDE", ["u1"], "u1", true)).toEqual({
      mode: "INCLUDE",
      userIds: ["u1"],
    });
    expect(applyMemberColumnAccess("INCLUDE", ["u1"], "u2", true)).toEqual({
      mode: "INCLUDE",
      userIds: ["u1", "u2"],
    });
  });
  it("INCLUDE + hide removes the user", () => {
    expect(applyMemberColumnAccess("INCLUDE", ["u1", "u2"], "u1", false)).toEqual({
      mode: "INCLUDE",
      userIds: ["u2"],
    });
  });
  it("EXCLUDE + hide adds the user to the exclude list", () => {
    expect(applyMemberColumnAccess("EXCLUDE", ["u1"], "u2", false)).toEqual({
      mode: "EXCLUDE",
      userIds: ["u1", "u2"],
    });
  });
  it("EXCLUDE + show removes the user; empty list reverts to ALL", () => {
    expect(applyMemberColumnAccess("EXCLUDE", ["u1"], "u1", true)).toEqual({
      mode: "ALL",
      userIds: [],
    });
    expect(applyMemberColumnAccess("EXCLUDE", ["u1", "u2"], "u1", true)).toEqual({
      mode: "EXCLUDE",
      userIds: ["u2"],
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- brood-access`
Expected: FAIL — `Failed to resolve import "./brood-access"` / functions not defined.

- [ ] **Step 3: Write the implementation**

Create `src/lib/brood-access.ts`:

```ts
import type { FieldAccessMode } from "@prisma/client";

/** A selectable user in the access UI. */
export type UserOpt = { id: string; label: string };

/** One column's access rule, as shown in the member grid. */
export type AccessField = {
  id: string;
  label: string;
  type: string;
  accessMode: FieldAccessMode;
  userIds: string[];
};

/** A shared brood with its membership list and column rules. */
export type AccessBrood = {
  id: string;
  name: string;
  members: string[];
  fields: AccessField[];
};

/**
 * Whether a brood member sees a column, given its rule. This is the non-admin
 * half of `fieldVisible` — the membership gate is checked separately.
 */
export function memberSeesColumn(
  mode: FieldAccessMode,
  userIds: string[],
  userId: string,
): boolean {
  if (mode === "ALL") return true;
  const inList = userIds.includes(userId);
  return mode === "INCLUDE" ? inList : !inList;
}

/**
 * New (mode, userIds) so that `userId`'s effective visibility becomes `canView`,
 * auto-converting modes:
 *  - ALL + hide   -> EXCLUDE [userId]   (everyone else still sees it)
 *  - INCLUDE      -> add / remove userId
 *  - EXCLUDE      -> remove / add userId; an empty EXCLUDE list reverts to ALL
 */
export function applyMemberColumnAccess(
  mode: FieldAccessMode,
  userIds: string[],
  userId: string,
  canView: boolean,
): { mode: FieldAccessMode; userIds: string[] } {
  const without = userIds.filter((id) => id !== userId);
  switch (mode) {
    case "ALL":
      return canView
        ? { mode: "ALL", userIds: [] }
        : { mode: "EXCLUDE", userIds: [userId] };
    case "INCLUDE":
      return canView
        ? { mode: "INCLUDE", userIds: [...without, userId] }
        : { mode: "INCLUDE", userIds: without };
    case "EXCLUDE": {
      const next = canView ? without : [...without, userId];
      return next.length === 0
        ? { mode: "ALL", userIds: [] }
        : { mode: "EXCLUDE", userIds: next };
    }
    default:
      return { mode, userIds };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- brood-access`
Expected: PASS — all `memberSeesColumn` + `applyMemberColumnAccess` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/brood-access.ts src/lib/brood-access.test.ts
git commit -m "feat: pure brood-access helpers (member visibility + mode auto-convert)"
```

---

## Task 2: Schema comment fix + push membership table

**Files:**
- Modify: `prisma/schema.prisma:127-128`

- [ ] **Step 1: Inspect any pending schema change**

Run: `git diff prisma/schema.prisma`
Expected: shows the pre-existing uncommitted change (note it; do not discard it). Proceed regardless.

- [ ] **Step 2: Fix the misleading BroodMember comment**

The current comment claims an empty list means "open to all" — the opposite of the hard gate. Replace the two comment lines above `model BroodMember` (lines 127-128):

Old:
```prisma
// Who is allowed in a (shared) brood. EMPTY list = open to all approved users
// (backward-compatible default). When non-empty, only listed users are members.
```

New:
```prisma
// Membership of a (shared) brood — the hard visibility gate. A user sees a
// shared brood in the app ONLY if they have a row here. No rows = nobody sees it.
```

- [ ] **Step 3: Push the schema to the database**

Run: `npm run db:push`
Expected: Prisma reports the schema is in sync / creates the `BroodMember` table and its indexes. No data loss prompt (table is additive).

- [ ] **Step 4: Regenerate the client (if not auto-run)**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — `prisma.broodMember` is available.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "docs: clarify BroodMember is a hard visibility gate"
```

---

## Task 3: Gate logic in access.ts

**Files:**
- Modify: `src/lib/access.ts` (`fieldVisible`, `getTabsWithFields`, `TabWithFields`, `broodVisibleTo`, `getBroodAccessConfig` + `BroodAccess` type)

- [ ] **Step 1: Import the helper and shared type**

At the top of `src/lib/access.ts`, add (next to the existing imports):

```ts
import { memberSeesColumn, type AccessBrood } from "./brood-access";
```

- [ ] **Step 2: Delegate `fieldVisible` to the helper (DRY)**

Replace the body of `fieldVisible` (currently around lines 40-50):

```ts
export function fieldVisible(
  admin: boolean,
  mode: FieldAccessMode,
  userIds: string[],
  userId: string,
): boolean {
  if (admin) return true;
  return memberSeesColumn(mode, userIds, userId);
}
```

- [ ] **Step 3: Load members in `getTabsWithFields`**

In the `getTabsWithFields` `cache(async () => prisma.tab.findMany({...}))` call, add `members` to the `include` (alongside `fields`):

```ts
include: {
  fields: {
    orderBy: { order: "asc" },
    include: { access: { select: { userId: true } } },
  },
  members: { select: { userId: true } },
},
```

- [ ] **Step 4: Add members to the `TabWithFields` type**

Update the `TabWithFields` type:

```ts
type TabWithFields = {
  ownerId: string | null;
  members: { userId: string }[];
  fields: { accessMode: FieldAccessMode; access: { userId: string }[] }[];
};
```

- [ ] **Step 5: Rewrite `broodVisibleTo` as the hard gate**

Replace the whole `broodVisibleTo` function:

```ts
/**
 * Whether a user can see a brood. Personal broods (ownerId set) are owner-only.
 * Shared broods are visible ONLY to their members — admins included.
 */
function broodVisibleTo(user: SessionUser, tab: TabWithFields): boolean {
  if (tab.ownerId) return tab.ownerId === user.id;
  return tab.members.some((m) => m.userId === user.id);
}
```

(`getVisibleFields` is unchanged: it still early-returns `[]` when the gate fails, and its existing `effectiveAdmin` keeps the all-columns bypass for admins who are members and for personal-brood owners.)

- [ ] **Step 6: Return members from `getBroodAccessConfig`**

In `getBroodAccessConfig`, add `members` to the `select` on `prisma.tab.findMany` (alongside `id`, `name`, `fields`):

```ts
members: { select: { userId: true } },
```

Then include it in the mapped result:

```ts
return tabs.map((t) => ({
  id: t.id,
  name: t.name,
  members: t.members.map((m) => m.userId),
  fields: t.fields.map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type as string,
    accessMode: f.accessMode,
    userIds: f.access.map((a) => a.userId),
  })),
}));
```

- [ ] **Step 7: Use the shared return type**

Change the `getBroodAccessConfig` signature to return the shared type and delete the now-redundant local `BroodAccess` type definition above it:

```ts
export async function getBroodAccessConfig(): Promise<AccessBrood[]> {
```

Remove the old `type BroodAccess = {...}` block (the one with `id`, `name`, `fields`). If `BroodAccess` is referenced elsewhere in the file, replace those references with `AccessBrood`.

- [ ] **Step 8: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors from `access.ts`. (Errors in `brood-access-panel.tsx` / `admin-sections.tsx` / `broods/page.tsx` about `members` or imports are expected — fixed in Tasks 5-6.)

- [ ] **Step 9: Commit**

```bash
git add src/lib/access.ts
git commit -m "feat: gate shared brood visibility on BroodMember membership"
```

---

## Task 4: Server actions

**Files:**
- Modify: `src/app/(app)/admin/actions.ts` (add three actions near the existing `setFieldAccess` / `setBroodAccess`)

- [ ] **Step 1: Import the conversion helper + type**

Ensure `FieldAccessMode` is imported (it already is, used by `setFieldAccess`). Add:

```ts
import { applyMemberColumnAccess } from "@/lib/brood-access";
```

- [ ] **Step 2: Add `setBroodMembership`**

Append in the column-access section of `actions.ts`:

```ts
/** Add or remove one user's membership in a shared brood (the visibility gate). */
export async function setBroodMembership(
  tabId: string,
  userId: string,
  isMember: boolean,
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

- [ ] **Step 3: Add `setColumnMode`**

```ts
/** Set one column's access mode (brood-wide). Switching to ALL clears its list. */
export async function setColumnMode(fieldId: string, mode: FieldAccessMode) {
  await requireAdmin();
  const field = await prisma.fieldDef.findUniqueOrThrow({
    where: { id: fieldId },
    select: { tabId: true },
  });
  await prisma.$transaction([
    prisma.fieldDef.update({ where: { id: fieldId }, data: { accessMode: mode } }),
    ...(mode === "ALL"
      ? [prisma.fieldAccessUser.deleteMany({ where: { fieldId } })]
      : []),
  ]);
  revalidateAccess(field.tabId);
}
```

- [ ] **Step 4: Add `setMemberColumnAccess`**

```ts
/**
 * Toggle whether one member sees one column. Reads the column's current rule and
 * auto-converts the mode (e.g. unchecking an ALL column makes it EXCLUDE).
 */
export async function setMemberColumnAccess(
  fieldId: string,
  userId: string,
  canView: boolean,
) {
  await requireAdmin();
  const field = await prisma.fieldDef.findUniqueOrThrow({
    where: { id: fieldId },
    select: {
      tabId: true,
      accessMode: true,
      access: { select: { userId: true } },
    },
  });
  const next = applyMemberColumnAccess(
    field.accessMode,
    field.access.map((a) => a.userId),
    userId,
    canView,
  );
  await prisma.$transaction([
    prisma.fieldDef.update({
      where: { id: fieldId },
      data: { accessMode: next.mode },
    }),
    prisma.fieldAccessUser.deleteMany({ where: { fieldId } }),
    ...next.userIds.map((uid) =>
      prisma.fieldAccessUser.create({ data: { fieldId, userId: uid } }),
    ),
  ]);
  revalidateAccess(field.tabId);
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors from `actions.ts`. (`broodMember`, `tabId_userId` compound-unique, and `applyMemberColumnAccess` all resolve.)

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/admin/actions.ts
git commit -m "feat: server actions for brood membership + per-member column access"
```

---

## Task 5: Wire the access data into People; remove the Access tab

**Files:**
- Modify: `src/components/admin/admin-sections.tsx`
- Modify: `src/app/(app)/admin/broods/page.tsx`
- Delete: `src/components/admin/brood-access-panel.tsx`

- [ ] **Step 1: Update imports + types in `admin-sections.tsx`**

Replace the `BroodAccessPanel` import block:

```ts
import {
  BroodAccessPanel,
  type Brood,
  type UserOpt,
} from "@/components/admin/brood-access-panel";
```

with:

```ts
import type { AccessBrood, UserOpt } from "@/lib/brood-access";
```

- [ ] **Step 2: Drop the Access tab from `SECTIONS`**

Change `SECTIONS` to remove the `access` entry:

```ts
const SECTIONS = [
  { key: "broods", label: "Broods" },
  { key: "people", label: "People" },
  { key: "whatsapp", label: "WhatsApp" },
] as const;
```

- [ ] **Step 3: Update the component props type**

In `AdminSections`'s props, change `accessBroods: Brood[]` to `accessBroods: AccessBrood[]` (the `accessUsers: UserOpt[]` prop stays — WhatsApp still uses it).

- [ ] **Step 4: Pass access data into the People section, delete the Access branch**

Replace the People and Access branches:

```tsx
{section === "people" && (
  <>
    <InviteForm />
    <UsersTable
      users={users}
      currentUserId={currentUserId}
      isAdmin
      accessBroods={accessBroods}
    />
  </>
)}

{section === "whatsapp" && (
```

(Delete the entire `{section === "access" && ( <BroodAccessPanel .../> )}` block.)

- [ ] **Step 5: Fix the import in `broods/page.tsx`**

Replace:

```ts
import type { UserOpt } from "@/components/admin/brood-access-panel";
```

with:

```ts
import type { UserOpt } from "@/lib/brood-access";
```

(The existing `accessBroods = accessConfig.map((b) => ({ ...b, fields: b.fields.filter((f) => f.type !== "person") }))` already carries `members` through, since `getBroodAccessConfig` now returns it. No other change here.)

- [ ] **Step 6: Delete the obsolete panel**

```bash
git rm src/components/admin/brood-access-panel.tsx
```

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: Only errors remaining are in `users-table.tsx` (missing `accessBroods` prop / `MemberAccess`) — fixed in Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/admin-sections.tsx src/app/\(app\)/admin/broods/page.tsx
git commit -m "refactor: remove Access tab, route access data into People"
```

---

## Task 6: Expandable member rows in `users-table.tsx`

**Files:**
- Modify: `src/components/admin/users-table.tsx`

- [ ] **Step 1: Add imports + the access-mode label map**

At the top of `users-table.tsx`, extend the imports and add the label map and `MemberAccess` types:

```ts
import { ChevronDown } from "lucide-react";
import { Select } from "@/components/ui/select";
import {
  memberSeesColumn,
  applyMemberColumnAccess,
  type AccessBrood,
} from "@/lib/brood-access";
import {
  setBroodMembership,
  setColumnMode,
  setMemberColumnAccess,
} from "@/app/(app)/admin/actions";
import type { FieldAccessMode } from "@prisma/client";
```

Keep the existing imports (`Pencil`, `Phone`, `approveUser`, etc.). Add below the `U` type:

```ts
type Mode = FieldAccessMode;
const MODE_LABEL: Record<Mode, string> = {
  ALL: "Brood Member",
  INCLUDE: "Only these",
  EXCLUDE: "Everyone except",
};
```

- [ ] **Step 2: Accept `accessBroods` + track the expanded row**

Change the `UsersTable` signature to add the prop:

```tsx
export function UsersTable({
  users,
  currentUserId,
  isAdmin,
  accessBroods,
}: {
  users: U[];
  currentUserId: string;
  isAdmin: boolean;
  accessBroods: AccessBrood[];
}) {
  const [pending, start] = React.useTransition();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const colSpan = isAdmin ? 4 : 3;
```

- [ ] **Step 3: Wrap each row in a fragment and add a chevron toggle**

Change the row map so each user yields the existing `<motion.tr>` plus an expander row. Replace the opening of the map and the user-name cell so the `<motion.tr>` is wrapped:

Replace:

```tsx
              return (
                <motion.tr
                  key={u.id}
                  layout
```

with:

```tsx
              const expanded = openId === u.id;
              return (
                <React.Fragment key={u.id}>
                <motion.tr
                  layout
```

Then inside the user cell, add a chevron button right before the avatar block. Replace:

```tsx
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.image ? (
```

with:

```tsx
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setOpenId(expanded ? null : u.id)}
                        aria-label={expanded ? "Collapse access" : "Expand access"}
                        className="shrink-0 text-faint transition-colors hover:text-ink"
                      >
                        <ChevronDown
                          className="h-4 w-4 transition-transform"
                          style={{
                            transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
                          }}
                        />
                      </button>
                      {u.image ? (
```

- [ ] **Step 4: Close the fragment and render the expander row**

Find the end of the row — replace:

```tsx
                </motion.tr>
              );
            })}
```

with:

```tsx
                </motion.tr>
                {expanded && (
                  <tr className="border-b border-border-soft last:border-0 bg-surface-2/20">
                    <td colSpan={colSpan} className="px-4 py-3">
                      <MemberAccess userId={u.id} broods={accessBroods} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
```

- [ ] **Step 5: Add the `MemberAccess` component**

Append to `users-table.tsx` (after `UsersTable`, before `NicknameEditor`):

```tsx
/**
 * Per-member access editor: level 1 is brood membership (the gate), level 2 is
 * each column's mode (brood-wide) + whether THIS member sees it. Optimistic:
 * edits update a local mirror immediately and fire a server action; the mirror
 * re-seeds when revalidated props arrive.
 */
function MemberAccess({
  userId,
  broods,
}: {
  userId: string;
  broods: AccessBrood[];
}) {
  const [model, setModel] = React.useState(broods);
  const sig = JSON.stringify(broods);
  const [prevSig, setPrevSig] = React.useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setModel(broods);
  }
  const [, start] = React.useTransition();

  const setMember = (tabId: string, isMember: boolean) => {
    setModel((m) =>
      m.map((b) =>
        b.id !== tabId
          ? b
          : {
              ...b,
              members: isMember
                ? [...b.members.filter((id) => id !== userId), userId]
                : b.members.filter((id) => id !== userId),
            },
      ),
    );
    start(() => setBroodMembership(tabId, userId, isMember).then(() => {}));
  };

  const setMode = (tabId: string, fieldId: string, mode: Mode) => {
    setModel((m) =>
      m.map((b) =>
        b.id !== tabId
          ? b
          : {
              ...b,
              fields: b.fields.map((f) =>
                f.id !== fieldId
                  ? f
                  : {
                      ...f,
                      accessMode: mode,
                      userIds: mode === "ALL" ? [] : f.userIds,
                    },
              ),
            },
      ),
    );
    start(() => setColumnMode(fieldId, mode).then(() => {}));
  };

  const setSees = (tabId: string, fieldId: string, canView: boolean) => {
    setModel((m) =>
      m.map((b) =>
        b.id !== tabId
          ? b
          : {
              ...b,
              fields: b.fields.map((f) =>
                f.id !== fieldId
                  ? f
                  : {
                      ...f,
                      ...applyMemberColumnAccess(
                        f.accessMode,
                        f.userIds,
                        userId,
                        canView,
                      ),
                    },
              ),
            },
      ),
    );
    start(() => setMemberColumnAccess(fieldId, userId, canView).then(() => {}));
  };

  if (model.length === 0)
    return <p className="text-xs text-faint">No shared broods.</p>;

  return (
    <div className="space-y-3">
      {model.map((b) => {
        const isMember = b.members.includes(userId);
        return (
          <div
            key={b.id}
            className="rounded-lg border border-border-soft bg-surface p-3"
          >
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={isMember}
                onChange={(e) => setMember(b.id, e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              {b.name}
              {!isMember && (
                <span className="text-xs font-normal text-faint">
                  not a member
                </span>
              )}
            </label>

            {isMember && b.fields.length > 0 && (
              <div className="mt-3 space-y-2">
                {b.fields.map((f) => {
                  const sees = memberSeesColumn(f.accessMode, f.userIds, userId);
                  return (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <span className="min-w-[7rem] flex-1 text-sm text-ink">
                        {f.label}
                      </span>
                      <Select
                        value={f.accessMode}
                        onChange={(v) => setMode(b.id, f.id, v as Mode)}
                        ariaLabel="Column visibility mode (applies brood-wide)"
                        className="w-40"
                        options={(["ALL", "INCLUDE", "EXCLUDE"] as const).map(
                          (mm) => ({ value: mm, label: MODE_LABEL[mm] }),
                        )}
                      />
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={sees}
                          onChange={(e) => setSees(b.id, f.id, e.target.checked)}
                          className="h-4 w-4 accent-accent"
                        />
                        sees
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: PASS — no errors across the project.

Run: `npm run lint`
Expected: No new errors. (If lint flags `react-hooks/set-state-in-effect`-style rules on the `if (sig !== prevSig)` re-seed, mirror the existing eslint-disable already used by `NicknameEditor`/`RuleEditor` for the same pattern.)

- [ ] **Step 7: Commit**

```bash
git add src/components/admin/users-table.tsx
git commit -m "feat: member-centric access editor in People rows"
```

---

## Task 7: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npm run test`
Expected: PASS — `brood-access`, `permissions`, `whatsapp` suites all green.

- [ ] **Step 2: Production build (typecheck + bundle)**

Run: `npm run build`
Expected: Compiles successfully, no type errors. Confirms `users-table.tsx` ("use client") does not pull `prisma` (it only imports the pure `@/lib/brood-access` + server actions).

- [ ] **Step 3: Manual smoke test (dev)**

Run: `npm run dev`, sign in as an admin, go to `/admin/broods` → **People** tab. Verify:
  1. Only three tabs show: Broods, People, WhatsApp (no Access).
  2. Each member row has a chevron; expanding shows the shared broods list.
  3. Toggling a brood's membership checkbox shows/hides its column list and persists across refresh.
  4. A column in "Brood Member" mode: the member's "sees" box is checked; unchecking it flips the mode select to "Everyone except" and the member stops seeing it.
  5. Re-checking the last excluded member flips the mode back to "Brood Member".
  6. Switching a column to "Only these" + checking a member grants only that member.

- [ ] **Step 4: Verify the gate end-to-end**

As a **non-admin** member with NO `BroodMember` row for a shared brood: confirm the brood does not appear in the top nav / home. Add them via the People tab; confirm it now appears with only the columns their checkboxes allow. (A non-member admin also does not see the brood in-app, but still manages it from the People tab.)

- [ ] **Step 5: Final commit (if any tweaks from smoke test)**

```bash
git add -A
git commit -m "fix: member-centric access smoke-test adjustments"
```

---

## Self-Review Notes

- **Spec coverage:** merge to one tab (Task 5) ✓; two-level membership+column (Task 6) ✓; hard gate incl. admins (Task 3) ✓; keep modes + per-member checkbox with auto-convert (Tasks 1, 4, 6) ✓; instant optimistic (Task 6) ✓; empty-EXCLUDE→ALL (Task 1) ✓; admin all-columns bypass within joined broods (Task 3, `getVisibleFields` untouched) ✓; start empty / `db:push` (Task 2) ✓; delete `BroodAccessPanel` (Task 5) ✓.
- **Type consistency:** `AccessBrood`/`AccessField`/`UserOpt` defined once in `brood-access.ts`, consumed by `access.ts`, `admin-sections.tsx`, `users-table.tsx`, `broods/page.tsx`. `Mode = FieldAccessMode`. Action names match across Tasks 4 and 6: `setBroodMembership`, `setColumnMode`, `setMemberColumnAccess`.
- **Gate vs default:** the schema comment fix (Task 2) and `broodVisibleTo` (Task 3) agree — empty membership = nobody sees the brood.
