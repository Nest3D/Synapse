# Invite-based access + page/field permissions — Design

Date: 2026-06-21
Status: Approved (architecture), pending implementation plan

## Goal

Replace open self-signup with an **admin invite allowlist**, and add
**per-person permissions** at two grains:

- **Pages** = which tabs/views a person can open (reuses tab membership).
- **Fields (view)** = which columns a person can SEE inside a tab they can open.

Only invited emails may log in (Google OAuth). Non-invited emails are rejected
at the door. Invited users still pass through the existing
`pending → approve` step.

## Chosen architecture (Approach C)

"Invite" **pre-creates a real `User` row** (`status: pending`, no linked OAuth
account yet) together with its permissions. Google login **links** to that
pre-made user by verified email. This gives one canonical, user-keyed
permission model with no duplicate invite tables and no copy-on-approval step.

### Flow

```
Admin → People → Invite (email, role, tabs, fields)
   → create User{status: pending, role} + TabMembership[] + FieldPermission[]
Person → Google login
   → signIn callback: a User with this email exists (or it's ADMIN_EMAIL)?
        yes → link account + allow      no → return false → rejected
   → lands on /pending (status still pending)
Admin → Approve → status: approved → full access per preset permissions
```

## Data model

New table:

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

`FieldPermission` is an **allowlist** of fields a user may view. Back-relations
added to `User` and `FieldDef`. Page permissions reuse the existing
`TabMembership`. No schema change to status enum — "invited vs pending" is
**derived** from whether the user has any linked `Account`.

## Permission semantics

- **Page (tab):** unchanged — `TabMembership` controls which tabs a user opens;
  admin sees all. Existing row visibility (`TAGGED_ONLY` / `ALL_ROWS`) still
  applies underneath.
- **Field (view):** for a given (user, tab):
  - user has **zero** `FieldPermission` rows for that tab's fields → sees **all**
    fields (opt-in restriction; assigning a tab "just works").
  - user has **≥1** `FieldPermission` row for that tab → sees **only** granted
    fields. New fields added later are hidden until granted.
  - **Admin** always sees all fields, ignoring `FieldPermission`.

## Enforcement (3 layers)

1. **Server read** — `access.ts`:
   - `getVisibleFieldKeys(user, tabId): string[]` — resolves the visible set.
   - `getVisibleTasks` strips non-visible keys out of each task's `values` JSON
     before returning, so the client never receives hidden cell data.
2. **Render** — tab page / `task-grid.tsx` build columns from the visible field
   set only.
3. **Server write** — task mutation actions validate that every edited field key
   is in the user's visible set for that tab; otherwise throw `Forbidden`.

The `person` field is treated like any other field for visibility (column hidden
if not granted), but assignee logic stays server-side and is unaffected.

## Auth changes (`src/auth.ts`)

- Google provider: `allowDangerousEmailAccountLinking: true` — safe here because
  the email is admin-vetted and Google-verified; it links the OAuth login to the
  invite-created user shell.
- Add `signIn` callback: allow when `email === ADMIN_EMAIL` **or** a `User` with
  that email already exists; otherwise return `false`.
- Keep the `createUser` event auto-promoting `ADMIN_EMAIL` to `admin/approved`
  so the first admin can bootstrap without an invite.

## Admin actions (`src/app/(app)/admin/actions.ts`)

- `inviteUser(email, role, tabIds[], fieldIds[])` — validates email is not
  already a user; creates `User{status: pending, role}` + `TabMembership` rows +
  `FieldPermission` rows.
- `setUserPermissions(userId, tabIds[], fieldIds[])` — edit page/field perms for
  an existing user (reuses the same form as invite).
- Reuse existing `approveUser`, `setRole`, `removeUser` (delete cascades
  memberships, accounts, field perms).

## UI (`admin/users` page + components)

- **Invite form:** email + role + multiselect tabs; per selected tab, checklist
  of its fields (unchecked-all = see all). Submits `inviteUser`.
- **People table:** status badge shows `invited` (no linked account yet) /
  `pending` / `approved`. Add an "Edit permissions" affordance calling
  `setUserPermissions`.
- Query gains `_count.accounts` (or `accounts: { select: { id }}`) to derive
  invited vs pending.

## Login rejection UX (`src/app/login/page.tsx`)

Read `?error=AccessDenied` and show: "This email isn't invited. Ask an admin to
invite you." (instead of a generic error).

## WhatsApp

Unaffected. `resolvePerson` already matches by name/email and now resolves
invited users even before first login (the shell exists). Field-view perms do
not constrain ingest (it writes tasks, doesn't read them as a viewer).

## Out of scope (YAGNI)

- Field **edit** permissions (view-only grain chosen).
- Expiring invites / invite emails sent automatically.
- Bulk invite / CSV import.

## Testing

- Unit: `getVisibleFieldKeys` (zero rows → all; some rows → subset; admin → all).
- Unit: `signIn` gate (known email allow, unknown reject, ADMIN_EMAIL allow).
- Integration: `getVisibleTasks` strips hidden keys; mutation rejects hidden-key
  write.
- Manual: invite → login links account → pending → approve → sees only granted
  tabs/columns.
