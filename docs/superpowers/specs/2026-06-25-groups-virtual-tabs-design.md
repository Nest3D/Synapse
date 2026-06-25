# Groups + virtual aggregate tabs — design

Date: 2026-06-25

## Goal

Two user-facing features:

1. **Create groups** of team members (in the People tab) that can be *tagged* on a task,
   not only individual people.
2. **List, per person, which groups they belong to** (on the People tab).

Plus the mechanics that make tagging a group meaningful: live group membership,
per-user "My Tasks" view, per-group views, and the permission logic that controls
who sees what.

## Locked decisions (from brainstorming)

- **Group tags are live.** A task stores the *group*, not a snapshot of its members.
  Adding a member later instantly affects who sees the task.
- **Any approved member can create a group**, from the People tab.
- **Edit/rename/delete a group: creator + admins.** Admins can edit any group.
- **Access is membership-driven.** A user only gets a group's tab in their nav if
  they are a member of that group; they only see group-tagged tasks for groups they
  belong to.
- **"My Tasks" and group tabs are virtual aggregate views** — read-through query
  views over the original tasks (which live in their home tabs). No duplication.
- **Nav auto-populates:** every user always sees `My Tasks`; each group they belong
  to auto-shows its group tab.
- **Virtual views are editable, write-through** to the original task.
- **Rendering: grouped by home tab** (option A) — each view shows a section per home
  tab rendered with that tab's existing `TaskGrid` + columns, so per-tab field
  permissions and editing are reused unchanged.

## Data model (Prisma)

```prisma
model Group {
  id          String   @id @default(cuid())
  name        String
  createdById String
  createdAt   DateTime @default(now())
  createdBy   User     @relation("GroupCreator", fields: [createdById], references: [id], onDelete: Cascade)
  members     GroupMembership[]
  taskTags    TaskGroupAssignee[]
  @@index([createdById])
}

model GroupMembership {
  id      String @id @default(cuid())
  groupId String
  userId  String
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([groupId, userId])
  @@index([userId])
  @@index([groupId])
}

model TaskGroupAssignee {
  id      String @id @default(cuid())
  taskId  String
  groupId String
  task    Task   @relation(fields: [taskId], references: [id], onDelete: Cascade)
  group   Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  @@unique([taskId, groupId])
  @@index([groupId])
  @@index([taskId])
}
```

New `User` relations: `groupsCreated Group[] @relation("GroupCreator")`,
`groupMemberships GroupMembership[]`.
New `Task` relation: `groupTags TaskGroupAssignee[]`.

## Permission / visibility logic (core)

Single rule used everywhere: **a user "sees" a task if they are a direct assignee OR
a member of a group tagged on the task** (admins see all).

- **Home tab** — access unchanged: opening a tab needs admin or `TabMembership`.
  The `TAGGED_ONLY` row filter generalizes from "direct assignee" to
  "direct assignee OR member of a tagged group".
- **My Tasks** (virtual, always in nav, per user) — every task across *all* tabs where
  the user is tagged directly or via a group. Not gated by tab membership; it is the
  user's personal cross-tab view.
- **Group tab** (virtual) — tasks tagged with that group. In nav only for that group's
  members (+ admins). Membership == access ("control who watches what").
- **Field permissions** (`FieldPermission`) still applied per home tab in every view.

## Navigation

Auto-populated top bar: `My Tasks` always; one entry per group the user belongs to.
New routes: `/(app)/my-tasks` and `/(app)/group/[groupId]`. A new
`getNavForUser(user)` in `access.ts` returns `{ tabs, groups }` (visible tabs +
the user's groups); the nav component renders My Tasks + tabs + group tabs.

## Rendering (option A — grouped by home tab)

`my-tasks` and `group/[groupId]` pages query the visible task set, group rows by
`tabId`, and render one section per home tab using the existing `TaskGrid` with that
tab's `getVisibleFields`. Editing writes through to the real task via existing actions.

## People tab — Create Group + membership display

`admin/users/page.tsx` opens to all approved members (currently admin-only).
Admin-only controls (approve / role / remove / invite) gated behind `isAdmin` — members
see a read-only user list. New **Groups** section:

- "Create group" (name + member picker) — any approved member; `createdById` recorded.
- Rename / delete / manage members — creator + admins only.
- Each person row lists the groups they belong to as chips (feature 2).

The People nav link becomes visible to all approved members (not just admins).

## Tagging UI

The task `PersonCell` dropdown lists **groups + individuals** together (groups shown
with a group icon and member count). Selecting a person writes `TaskAssignee` (today's
behavior); selecting a group writes `TaskGroupAssignee`. Stored distinctly so group
tags stay live. The cell renders selected groups as chips alongside person pills.

## Server actions

In a new `src/app/(app)/groups/actions.ts` (or extend `admin/actions.ts`):

- `createGroup(name, memberIds)` — any approved member; sets `createdById`.
- `renameGroup(groupId, name)`, `deleteGroup(groupId)` — creator/admin guarded.
- `addGroupMember(groupId, userId)`, `removeGroupMember(groupId, userId)` — creator/admin guarded.
- `setTaskGroups(taskId, groupIds)` — guarded like `setAssignees` (must be able to see
  the task + person field visible).

A `canEditGroup(user, groupId)` helper enforces creator-or-admin.

## Affected files

- `prisma/schema.prisma` (+ migration)
- `src/lib/access.ts` — generalized visibility rule, `getNavForUser`, virtual-view queries
- `src/app/(app)/admin/users/page.tsx` + new Groups UI components
- nav component (top bar)
- `src/components/task-grid.tsx` — `PersonCell` group support
- new `src/app/(app)/my-tasks/page.tsx` and `src/app/(app)/group/[groupId]/page.tsx`
- new group server actions
- access gate so approved members can reach the People page

## Out of scope (YAGNI)

- Nested groups / groups-in-groups.
- Group-level field permissions (handled per home tab).
- Snapshot/freezing of group membership at tag time.
