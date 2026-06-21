# Invite-based Access + Page/Field Permissions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace open self-signup with an admin invite allowlist, and add per-person page (tab) and field (column view) permissions.

**Architecture:** "Invite" pre-creates a real `User` row (status `pending`) plus its `TabMembership` and new `FieldPermission` rows. Google login links to that user by verified email; unknown emails are rejected in the `signIn` callback. Field visibility is an opt-in allowlist enforced in three layers: server read (strip JSON), render (columns), server write (reject hidden-key edits).

**Tech Stack:** Next.js 16 (App Router, server actions), Prisma + Postgres (Neon), Auth.js v5 (Google), Vitest (added here for unit tests), TypeScript, Tailwind v4.

Spec: `docs/superpowers/specs/2026-06-21-invite-permissions-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/lib/permissions.ts` | Pure permission logic (no DB): field-key resolution, login gate, value stripping | Create |
| `src/lib/permissions.test.ts` | Unit tests for the above | Create |
| `vitest.config.ts` | Vitest config | Create |
| `prisma/schema.prisma` | Add `FieldPermission` model + back-relations | Modify |
| `src/auth.ts` | Account linking + `signIn` allowlist gate | Modify |
| `src/lib/access.ts` | DB-backed `getVisibleFieldKeys` / `getVisibleFields`, strip in `getVisibleTasks`, `assertFieldVisible` | Modify |
| `src/app/(app)/actions.ts` | Validate edited field key is visible | Modify |
| `src/app/(app)/admin/actions.ts` | `inviteUser`, `setUserPermissions` | Modify |
| `src/app/(app)/tab/[tabId]/page.tsx` | Pass only visible fields to grid | Modify |
| `src/app/(app)/admin/users/page.tsx` | Load tabs+fields+account-count; render invite UI | Modify |
| `src/components/admin/invite-form.tsx` | Invite + permissions editor (client) | Create |
| `src/components/admin/users-table.tsx` | `invited` badge derivation | Modify |
| `src/app/login/page.tsx` | Friendly "not invited" message on `?error=AccessDenied` | Modify |

---

## Task 1: Pure permissions module + Vitest

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/permissions.ts`
- Test: `src/lib/permissions.test.ts`

- [ ] **Step 1: Install Vitest**

Run: `npm i -D vitest@^2`
Expected: adds vitest to devDependencies.

- [ ] **Step 2: Add test script to `package.json`**

In the `"scripts"` block add:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Write the failing test** — `src/lib/permissions.test.ts`

```ts
import { describe, it, expect } from "vitest";
import {
  resolveVisibleFieldKeys,
  isLoginAllowed,
  stripValuesToVisible,
} from "./permissions";

describe("resolveVisibleFieldKeys", () => {
  const all = ["person", "description", "category", "done"];

  it("admin sees all fields regardless of grants", () => {
    expect(resolveVisibleFieldKeys({ allKeys: all, grantedKeys: ["done"], isAdmin: true })).toEqual(all);
  });

  it("no grants means see all (opt-in restriction)", () => {
    expect(resolveVisibleFieldKeys({ allKeys: all, grantedKeys: [], isAdmin: false })).toEqual(all);
  });

  it("with grants, sees only granted, in allKeys order", () => {
    expect(
      resolveVisibleFieldKeys({ allKeys: all, grantedKeys: ["done", "person"], isAdmin: false }),
    ).toEqual(["person", "done"]);
  });

  it("ignores granted keys that no longer exist on the tab", () => {
    expect(
      resolveVisibleFieldKeys({ allKeys: all, grantedKeys: ["ghost", "category"], isAdmin: false }),
    ).toEqual(["category"]);
  });
});

describe("isLoginAllowed", () => {
  it("allows the bootstrap admin email even without a user row", () => {
    expect(isLoginAllowed({ email: "a@b.com", adminEmail: "a@b.com", userExists: false })).toBe(true);
  });
  it("allows any email that already has a user row (invited)", () => {
    expect(isLoginAllowed({ email: "x@y.com", adminEmail: "a@b.com", userExists: true })).toBe(true);
  });
  it("rejects unknown, non-admin emails", () => {
    expect(isLoginAllowed({ email: "x@y.com", adminEmail: "a@b.com", userExists: false })).toBe(false);
  });
  it("is case-insensitive on the admin email", () => {
    expect(isLoginAllowed({ email: "A@B.com", adminEmail: "a@b.com", userExists: false })).toBe(true);
  });
  it("rejects when email is null/empty", () => {
    expect(isLoginAllowed({ email: null, adminEmail: "a@b.com", userExists: false })).toBe(false);
  });
});

describe("stripValuesToVisible", () => {
  it("keeps only visible keys", () => {
    const values = { person: ["u1"], description: "hi", secret: 42 };
    expect(stripValuesToVisible(values, ["person", "description"])).toEqual({
      person: ["u1"],
      description: "hi",
    });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './permissions'`.

- [ ] **Step 6: Implement `src/lib/permissions.ts`**

```ts
/**
 * Pure permission helpers — no DB, no framework. Unit-tested in permissions.test.ts.
 */

/** Resolve which field keys a user may VIEW in a tab. */
export function resolveVisibleFieldKeys(args: {
  allKeys: string[];
  grantedKeys: string[];
  isAdmin: boolean;
}): string[] {
  const { allKeys, grantedKeys, isAdmin } = args;
  if (isAdmin) return allKeys;
  if (grantedKeys.length === 0) return allKeys; // opt-in restriction
  const granted = new Set(grantedKeys);
  return allKeys.filter((k) => granted.has(k));
}

/** Whether an email may sign in: bootstrap admin, or an existing (invited) user. */
export function isLoginAllowed(args: {
  email: string | null | undefined;
  adminEmail: string | undefined;
  userExists: boolean;
}): boolean {
  const { email, adminEmail, userExists } = args;
  if (!email) return false;
  if (adminEmail && email.toLowerCase() === adminEmail.toLowerCase()) return true;
  return userExists;
}

/** Keep only visible keys from a task values object. */
export function stripValuesToVisible(
  values: Record<string, unknown>,
  visibleKeys: string[],
): Record<string, unknown> {
  const visible = new Set(visibleKeys);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    if (visible.has(k)) out[k] = v;
  }
  return out;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test`
Expected: PASS — all assertions green.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/lib/permissions.ts src/lib/permissions.test.ts
git commit -m "Add Vitest + pure permission helpers"
```

---

## Task 2: FieldPermission schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the model** — append after the `TaskAssignee` model:

```prisma
model FieldPermission {
  id      String   @id @default(cuid())
  userId  String
  fieldId String
  user    User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  field   FieldDef @relation(fields: [fieldId], references: [id], onDelete: Cascade)

  @@unique([userId, fieldId])
  @@index([userId])
  @@index([fieldId])
}
```

- [ ] **Step 2: Add back-relation to `User`** — inside `model User`, add to the relation list:

```prisma
  fieldPermissions FieldPermission[]
```

- [ ] **Step 3: Add back-relation to `FieldDef`** — inside `model FieldDef`, add:

```prisma
  permissions FieldPermission[]
```

- [ ] **Step 4: Push schema and regenerate client**

Run: `npx prisma db push`
Expected: "Your database is now in sync with your Prisma schema." + "Generated Prisma Client".

- [ ] **Step 5: Verify the client typechecks the new model**

Run: `npx tsc --noEmit`
Expected: no new errors referencing `fieldPermission`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "Add FieldPermission model + relations"
```

---

## Task 3: Login allowlist gate (auth.ts)

**Files:**
- Modify: `src/auth.ts`

- [ ] **Step 1: Enable account linking on the Google provider**

Replace `providers: [Google],` with:

```ts
  providers: [
    Google({ allowDangerousEmailAccountLinking: true }),
  ],
```

(Safe: emails are admin-vetted and Google-verified; linking attaches the OAuth login to the invite-created user shell.)

- [ ] **Step 2: Import the pure gate helper** — add near the top imports:

```ts
import { isLoginAllowed } from "@/lib/permissions";
```

- [ ] **Step 3: Add a `signIn` callback** — inside the `callbacks` object, before `jwt`:

```ts
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      if (email === ADMIN_EMAIL) return true;
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      return isLoginAllowed({ email, adminEmail: ADMIN_EMAIL, userExists: !!existing });
    },
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Manual check (deferred to Task 10)** — note that full login flow is verified end-to-end in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/auth.ts
git commit -m "Reject non-invited emails at signIn; link OAuth to invited user"
```

---

## Task 4: Field-view enforcement on reads (access.ts)

**Files:**
- Modify: `src/lib/access.ts`

- [ ] **Step 1: Import pure helpers** — add to imports at top:

```ts
import { resolveVisibleFieldKeys, stripValuesToVisible } from "@/lib/permissions";
```

- [ ] **Step 2: Add `getVisibleFields`** — append to the file:

```ts
/**
 * Field definitions a user may VIEW in a tab (ordered). Admin sees all;
 * a user with no FieldPermission rows for the tab sees all; otherwise only granted.
 */
export async function getVisibleFields(user: SessionUser, tabId: string) {
  const fields = await prisma.fieldDef.findMany({
    where: { tabId },
    orderBy: { order: "asc" },
  });
  const admin = isAdmin(user);
  const granted = admin
    ? []
    : (
        await prisma.fieldPermission.findMany({
          where: { userId: user.id, field: { tabId } },
          select: { field: { select: { key: true } } },
        })
      ).map((p) => p.field.key);
  const visibleKeys = resolveVisibleFieldKeys({
    allKeys: fields.map((f) => f.key),
    grantedKeys: granted,
    isAdmin: admin,
  });
  const set = new Set(visibleKeys);
  return fields.filter((f) => set.has(f.key));
}

/** Convenience: just the visible field keys for a tab. */
export async function getVisibleFieldKeys(
  user: SessionUser,
  tabId: string,
): Promise<string[]> {
  return (await getVisibleFields(user, tabId)).map((f) => f.key);
}
```

- [ ] **Step 3: Strip hidden keys in `getVisibleTasks`** — replace the `return prisma.task.findMany({...})` block with:

```ts
  const tasks = await prisma.task.findMany({
    where: {
      tabId,
      ...(admin || !tagOnly
        ? {}
        : { assignees: { some: { userId: user.id } } }),
    },
    include: { assignees: { include: { user: true } } },
    orderBy: { position: "asc" },
  });

  const visibleKeys = await getVisibleFieldKeys(user, tabId);
  return tasks.map((t) => ({
    ...t,
    values: stripValuesToVisible(t.values as Record<string, unknown>, visibleKeys),
  }));
```

- [ ] **Step 4: Add `assertFieldVisible`** (used by write enforcement) — append:

```ts
/** Throws "Forbidden" if the user may not view/edit this field key in the tab. */
export async function assertFieldVisible(
  user: SessionUser,
  tabId: string,
  fieldKey: string,
): Promise<void> {
  const keys = await getVisibleFieldKeys(user, tabId);
  if (!keys.includes(fieldKey)) throw new Error("Forbidden");
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/access.ts
git commit -m "Enforce field-view permissions on task reads"
```

---

## Task 5: Field-write enforcement (actions.ts)

**Files:**
- Modify: `src/app/(app)/actions.ts`

- [ ] **Step 1: Import the assert helper** — update the access import line to include `assertFieldVisible`:

```ts
import { getApprovedUser, canAccessTab, canSeeTask, isAdmin, assertFieldVisible } from "@/lib/access";
```

- [ ] **Step 2: Guard `updateCell`** — after the `canSeeTask` check and before reading the task, add:

```ts
  const target = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true },
  });
  await assertFieldVisible(user, target.tabId, fieldKey);
```

Then reuse the existing `task` fetch below (leave it; it re-reads full values).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/actions.ts
git commit -m "Reject edits to non-visible fields"
```

---

## Task 6: Admin invite + permission actions

**Files:**
- Modify: `src/app/(app)/admin/actions.ts`

- [ ] **Step 1: Add `inviteUser`** — append in the `/* ---- Users ---- */` section:

```ts
export async function inviteUser(
  email: string,
  role: "admin" | "member",
  tabIds: string[],
  fieldIds: string[],
) {
  await requireAdmin();
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) throw new Error("Valid email required");

  const exists = await prisma.user.findUnique({ where: { email: clean } });
  if (exists) throw new Error("That email is already a user");

  await prisma.user.create({
    data: {
      email: clean,
      role,
      status: "pending",
      memberships: { create: tabIds.map((tabId) => ({ tabId })) },
      fieldPermissions: { create: fieldIds.map((fieldId) => ({ fieldId })) },
    },
  });
  revalidatePath("/admin/users");
}
```

- [ ] **Step 2: Add `setUserPermissions`** — append below `inviteUser`:

```ts
/** Replace a user's tab memberships and field permissions wholesale. */
export async function setUserPermissions(
  userId: string,
  tabIds: string[],
  fieldIds: string[],
) {
  await requireAdmin();
  await prisma.$transaction([
    prisma.tabMembership.deleteMany({ where: { userId } }),
    prisma.fieldPermission.deleteMany({ where: { userId } }),
    ...tabIds.map((tabId) =>
      prisma.tabMembership.create({ data: { userId, tabId } }),
    ),
    ...fieldIds.map((fieldId) =>
      prisma.fieldPermission.create({ data: { userId, fieldId } }),
    ),
  ]);
  revalidatePath("/admin/users");
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/(app)/admin/actions.ts
git commit -m "Add inviteUser + setUserPermissions admin actions"
```

---

## Task 7: Render only visible fields in tab grid

**Files:**
- Modify: `src/app/(app)/tab/[tabId]/page.tsx`

- [ ] **Step 1: Use `getVisibleFields`** — update the access import to include it:

```ts
import {
  getApprovedUser,
  getVisibleTabs,
  canAccessTab,
  getVisibleTasks,
  getVisibleFields,
  isAdmin,
} from "@/lib/access";
```

- [ ] **Step 2: Replace the `fields` query** — in the `Promise.all`, change the first entry from the raw `prisma.fieldDef.findMany(...)` to:

```ts
    getVisibleFields(user, tabId),
```

(The rest — `tasks`, `members` — stays. `getVisibleFields` returns the same `FieldDef` shape, ordered.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit`
Expected: no errors (the `fields.map(...)` for the grid already matches the FieldDef shape).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/tab/[tabId]/page.tsx"
git commit -m "Render only visible fields in tab grid"
```

---

## Task 8: Invite form + People page UI

**Files:**
- Create: `src/components/admin/invite-form.tsx`
- Modify: `src/app/(app)/admin/users/page.tsx`
- Modify: `src/components/admin/users-table.tsx`

- [ ] **Step 1: Create the invite form component** — `src/components/admin/invite-form.tsx`:

```tsx
"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { inviteUser } from "@/app/(app)/admin/actions";

type FieldOpt = { id: string; key: string; label: string };
type TabOpt = { id: string; name: string; fields: FieldOpt[] };

export function InviteForm({ tabs }: { tabs: TabOpt[] }) {
  const [pending, start] = React.useTransition();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [tabIds, setTabIds] = React.useState<string[]>([]);
  const [fieldIds, setFieldIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (
    id: string,
    list: string[],
    set: (v: string[]) => void,
  ) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const submit = () => {
    setError(null);
    start(() =>
      inviteUser(email, role, tabIds, fieldIds)
        .then(() => {
          setEmail("");
          setTabIds([]);
          setFieldIds([]);
        })
        .catch((e) => setError(e.message)),
    );
  };

  return (
    <div className="mb-8 rounded-xl border border-border bg-surface/30 p-5">
      <h2 className="font-display text-lg font-semibold">Invite someone</h2>
      <p className="mt-1 text-sm text-muted">
        Only invited emails can sign in. Leave a tab&apos;s fields unchecked to
        grant all columns.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          className="min-w-[16rem] flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "member")}
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
      </div>

      <div className="mt-4 space-y-3">
        {tabs.map((tab) => {
          const on = tabIds.includes(tab.id);
          return (
            <div key={tab.id} className="rounded-lg border border-border-soft p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(tab.id, tabIds, setTabIds)}
                />
                {tab.name}
              </label>
              {on && (
                <div className="mt-2 flex flex-wrap gap-3 pl-6">
                  {tab.fields.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-1.5 text-xs text-muted"
                    >
                      <input
                        type="checkbox"
                        checked={fieldIds.includes(f.id)}
                        onChange={() => toggle(f.id, fieldIds, setFieldIds)}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        <Button disabled={pending || !email} onClick={submit}>
          Send invite
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Load tabs+fields and account-count in the page** — replace the body of `src/app/(app)/admin/users/page.tsx` with:

```tsx
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/access";
import { UsersTable } from "@/components/admin/users-table";
import { InviteForm } from "@/components/admin/invite-form";

export default async function UsersPage() {
  const me = await getCurrentUser();
  const [users, tabs] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        status: true,
        createdAt: true,
        _count: { select: { accounts: true } },
      },
    }),
    prisma.tab.findMany({
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        fields: {
          orderBy: { order: "asc" },
          select: { id: true, key: true, label: true },
        },
      },
    }),
  ]);

  const pending = users.filter((u) => u.status === "pending");

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Admin
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          People
        </h1>
        <p className="mt-1 text-sm text-muted">
          Invite people, approve who gets in, set roles, remove access.
          {pending.length > 0 && (
            <span className="ml-2 rounded-full bg-warn/15 px-2 py-0.5 text-xs font-medium text-warn">
              {pending.length} awaiting approval
            </span>
          )}
        </p>
      </header>

      <InviteForm tabs={tabs} />

      <UsersTable
        users={users.map((u) => ({
          ...u,
          joined: u._count.accounts > 0,
        }))}
        currentUserId={me?.id ?? ""}
      />
    </div>
  );
}
```

- [ ] **Step 3: Show `invited` vs `pending` badge** — in `src/components/admin/users-table.tsx`:

Update the `U` type to add `joined`:

```ts
type U = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "admin" | "member";
  status: "pending" | "approved";
  joined: boolean;
};
```

Then in the Status cell, replace the displayed status text `{u.status}` with a derived label:

```tsx
                      {u.status === "pending" && !u.joined ? "invited" : u.status}
```

(Keep the existing colored dot logic as-is — `invited`/`pending` both render with the warn color since `status` is still `pending`.)

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/invite-form.tsx "src/app/(app)/admin/users/page.tsx" src/components/admin/users-table.tsx
git commit -m "Add invite form + invited badge to People page"
```

---

## Task 9: Login rejection message

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Accept `searchParams` and show the message** — change the component signature and add a banner.

Replace the signature:

```tsx
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(session.user.status === "approved" ? "/" : "/pending");
  }
```

Then, immediately inside the `<div className="glass ...">` (after `<Brand size="lg" />`), add:

```tsx
          {error === "AccessDenied" && (
            <p className="mt-6 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              This email isn&apos;t invited. Ask an admin to invite you first.
            </p>
          )}
```

- [ ] **Step 2: Update the helper copy** — change the bottom hint text to reflect invite-only:

```tsx
          <p className="mt-5 text-center text-xs text-faint">
            Invite-only. An admin must add your email before you can sign in.
          </p>
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "Show invite-only rejection message on login"
```

---

## Task 10: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run unit tests**

Run: `npm test`
Expected: all `permissions.test.ts` cases PASS.

- [ ] **Step 2: Start dev server**

Run: `npm run dev`
Expected: Ready on http://localhost:3000.

- [ ] **Step 3: Bootstrap admin** — sign in with `ADMIN_EMAIL` (`dim.reem@gmail.com`). Expected: lands on `/` as approved admin (allowed by `signIn` even without an invite).

- [ ] **Step 4: Reject path** — in an incognito window, attempt Google sign-in with a *non-invited* account. Expected: bounced to `/login?error=AccessDenied` with the "not invited" banner; no user row created (verify in `npx prisma studio`).

- [ ] **Step 5: Invite path** — as admin, go to **People → Invite someone**. Invite the test email, role `member`, select the **Marketing** tab, check only the **Task description** field. Expected: a row appears with status `invited`.

- [ ] **Step 6: Invited login** — sign in with the invited account. Expected: allowed (account links to the shell), lands on `/pending`.

- [ ] **Step 7: Approve + verify field scoping** — as admin, Approve the user. Sign in as that user, open **Marketing**. Expected: only the **Task description** column is visible; Person/Category/Done hidden.

- [ ] **Step 8: Write-guard** — as the restricted user, confirm no hidden columns render. (Server already rejects hidden-key edits via `assertFieldVisible`; the UI shows none to edit.)

- [ ] **Step 9: Final commit (if any verification fixes were needed)**

```bash
git add -A
git commit -m "Verification fixes for invite-permissions"
```

---

## Notes / gotchas

- `allowDangerousEmailAccountLinking` is required so Google links to the invite-created user (same verified email). Without it, Auth.js throws `OAuthAccountNotLinked` for pre-existing users.
- `getVisibleFields` returns full `FieldDef` rows in `order`, so the tab page's `fields.map(...)` to the grid shape is unchanged.
- Field restriction is **opt-in**: assigning a tab with no field checkboxes grants all columns. This matches the spec default.
- The `person` column being hidden does not break assignee storage — `setAssignees` works server-side regardless; the column just doesn't render for restricted users.
- WhatsApp ingest is unaffected; invited users are resolvable by `resolvePerson` before first login because the shell `User` exists.
- `setUserPermissions` (Task 6) is implemented but not yet wired to a UI button — initial perms are set at invite time. A post-join "Edit permissions" affordance reusing `InviteForm`'s checkboxes is a deliberate follow-up, out of scope for this plan.
