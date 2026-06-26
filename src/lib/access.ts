import { cache } from "react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { stripValuesToVisible } from "@/lib/permissions";
import type { Role, UserStatus, FieldAccessMode } from "@prisma/client";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: Role;
  status?: UserStatus;
};

/** Returns the session user if signed in, else null. Cached per request. */
export const getCurrentUser = cache(
  async (): Promise<SessionUser | null> => {
    const session = await auth();
    if (!session?.user?.id) return null;
    return session.user as SessionUser;
  },
);

/** Approved users only. Returns null otherwise (caller redirects). */
export async function getApprovedUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") return null;
  return user;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "admin" && user.status === "approved";
}

/**
 * Whether a single column is visible to a user, given its access rule.
 * Admins see everything; ALL is public; INCLUDE/EXCLUDE check the user list.
 */
export function fieldVisible(
  admin: boolean,
  mode: FieldAccessMode,
  userIds: string[],
  userId: string,
): boolean {
  if (admin) return true;
  if (mode === "ALL") return true;
  const inList = userIds.includes(userId);
  return mode === "INCLUDE" ? inList : !inList;
}

/** All broods with their columns + access lists. Cached per request. */
const getTabsWithFields = cache(async () =>
  prisma.tab.findMany({
    where: { archivedAt: null },
    orderBy: { order: "asc" },
    include: {
      fields: {
        orderBy: { order: "asc" },
        include: { access: { select: { userId: true } } },
      },
    },
  }),
);

/** A single tab by id, cached per request. */
export const getTab = cache((tabId: string) =>
  prisma.tab.findUnique({ where: { id: tabId } }),
);

type TabWithFields = {
  ownerId: string | null;
  fields: { accessMode: FieldAccessMode; access: { userId: string }[] }[];
};

/**
 * Whether a user can see a brood. Personal broods (ownerId set) are owner-only.
 * Shared broods are visible to admins, or to anyone with ≥1 visible column.
 */
function broodVisibleTo(user: SessionUser, tab: TabWithFields): boolean {
  if (tab.ownerId) return tab.ownerId === user.id;
  if (isAdmin(user)) return true;
  return tab.fields.some((f) =>
    fieldVisible(false, f.accessMode, f.access.map((a) => a.userId), user.id),
  );
}

/** Columns a user may VIEW in a brood (ordered), honoring each column's rule. */
export const getVisibleFields = cache(
  async (user: SessionUser, tabId: string) => {
    const tab = (await getTabsWithFields()).find((t) => t.id === tabId);
    if (!tab || !broodVisibleTo(user, tab)) return [];
    // The owner of a personal brood (and admins) see all its columns.
    const effectiveAdmin = isAdmin(user) || tab.ownerId === user.id;
    return tab.fields.filter((f) =>
      fieldVisible(
        effectiveAdmin,
        f.accessMode,
        f.access.map((a) => a.userId),
        user.id,
      ),
    );
  },
);

/** Convenience: just the visible field keys for a brood. */
export async function getVisibleFieldKeys(
  user: SessionUser,
  tabId: string,
): Promise<string[]> {
  return (await getVisibleFields(user, tabId)).map((f) => f.key);
}

/** Throws "Forbidden" if the user may not view/edit this column. */
export async function assertFieldVisible(
  user: SessionUser,
  tabId: string,
  fieldKey: string,
): Promise<void> {
  const keys = await getVisibleFieldKeys(user, tabId);
  if (!keys.includes(fieldKey)) throw new Error("Forbidden");
}

/** Broods the user may see: their personal broods + visible shared ones. Cached. */
export const getVisibleTabs = cache(async (user: SessionUser) => {
  const tabs = await getTabsWithFields();
  return tabs.filter((t) => broodVisibleTo(user, t));
});

/** True if the user may access a given brood at all. Cached per request. */
export const canAccessTab = cache(
  async (user: SessionUser, tabId: string): Promise<boolean> => {
    const tab = (await getTabsWithFields()).find((t) => t.id === tabId);
    if (!tab) return false;
    return broodVisibleTo(user, tab);
  },
);

/** Top-bar navigation: visible broods + the signed-in user's nickname. */
export const getNavForUser = cache(async (user: SessionUser) => {
  const [tabs, record] = await Promise.all([
    getVisibleTabs(user),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { nickname: true },
    }),
  ]);
  return { tabs, nickname: record?.nickname ?? null };
});

/**
 * Tasks in a brood. Every row is visible to anyone who can see the brood;
 * values are masked to the columns the user may view. Throws if no access.
 */
export async function getVisibleTasks(user: SessionUser, tabId: string) {
  const tab = await getTab(tabId);
  if (!tab) throw new Error("Tab not found");
  if (!(await canAccessTab(user, tabId))) throw new Error("Forbidden");

  const tasks = await prisma.task.findMany({
    where: { tabId, NOT: { values: { path: ["done"], equals: true } } },
    orderBy: { position: "asc" },
  });

  const visibleKeys = await getVisibleFieldKeys(user, tabId);
  return tasks.map((t) => ({
    ...t,
    values: stripValuesToVisible(t.values as Record<string, unknown>, visibleKeys),
  }));
}

/** Whether the user may see a specific task (used by mutations). */
export async function canSeeTask(
  user: SessionUser,
  taskId: string,
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      tabId: true,
      scope: true,
      createdById: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!task) return false;
  if (isAdmin(user)) return true;
  if (task.createdById === user.id) return true;
  if (task.assignees.some((a) => a.userId === user.id)) return true;
  if (task.scope === "EVERYONE") return true;
  if (task.scope === "BROOD" && task.tabId)
    return canAccessTab(user, task.tabId);
  return false;
}

/** Only the creator or an admin may edit/delete a brood-less task. */
export async function canManageLooseTask(
  user: SessionUser,
  task: { tabId: string | null; createdById: string | null },
): Promise<boolean> {
  if (isAdmin(user)) return true;
  if (task.tabId) return true; // brood tasks: anyone with brood access
  return task.createdById === user.id;
}

/** Fixed columns for brood-less tasks (no FieldDef). */
export const LOOSE_FIELDS = [
  { key: "description", label: "Task", type: "text", options: [] as string[] },
  { key: "done", label: "Done", type: "checkbox", options: [] as string[] },
];

export type ArchivedTask = {
  id: string;
  tabId: string;
  tabName: string;
  description: string;
  updatedAt: Date;
};

/**
 * Every "done" task across the broods the user may see, honoring brood access
 * and column visibility. Sorted newest-completed first.
 */
export async function getArchivedTasks(
  user: SessionUser,
): Promise<ArchivedTask[]> {
  const tabs = await getVisibleTabs(user);
  const out: ArchivedTask[] = [];

  for (const tab of tabs) {
    const visibleKeys = new Set(await getVisibleFieldKeys(user, tab.id));
    const tasks = await prisma.task.findMany({
      where: { tabId: tab.id, values: { path: ["done"], equals: true } },
      orderBy: { updatedAt: "desc" },
    });

    for (const t of tasks) {
      const values = t.values as Record<string, unknown>;
      out.push({
        id: t.id,
        tabId: tab.id,
        tabName: tab.name,
        description:
          visibleKeys.has("description") &&
          typeof values["description"] === "string"
            ? (values["description"] as string)
            : "",
        updatedAt: t.updatedAt,
      });
    }
  }

  out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return out;
}

export type ArchivedBrood = {
  id: string;
  name: string;
  archivedAt: Date;
  taskCount: number;
  personal: boolean;
};

/** Archived ("deleted") broods the user may see: their own + shared (if admin). */
export async function getArchivedBroods(
  user: SessionUser,
): Promise<ArchivedBrood[]> {
  const tabs = await prisma.tab.findMany({
    where: {
      archivedAt: { not: null },
      OR: [
        { ownerId: user.id },
        ...(isAdmin(user) ? [{ ownerId: null }] : []),
      ],
    },
    orderBy: { archivedAt: "desc" },
    select: {
      id: true,
      name: true,
      ownerId: true,
      archivedAt: true,
      _count: { select: { tasks: true } },
    },
  });
  return tabs.map((t) => ({
    id: t.id,
    name: t.name,
    archivedAt: t.archivedAt!,
    taskCount: t._count.tasks,
    personal: t.ownerId !== null,
  }));
}

/* ---------------- My Tasks (aggregate across accessible broods) ---------------- */

export type GridRow = {
  id: string;
  source: "manual" | "whatsapp";
  values: Record<string, unknown>;
};

export type GridSection = {
  tabId: string | null; // null = the personal (brood-less) section
  tabName: string;
  fields: { key: string; label: string; type: string; options: string[] }[];
  rows: GridRow[];
};

const toRow = (t: {
  id: string;
  source: "manual" | "whatsapp";
  values: unknown;
}): GridRow => ({
  id: t.id,
  source: t.source,
  values: t.values as Record<string, unknown>,
});

/**
 * "My Tasks": the user's personal brood-less tasks (private to them or tagged
 * to them) as a Personal section, plus every brood they can access. Access to a
 * brood == being tagged to its tasks. Only non-empty sections are included.
 */
export async function getMyTaskSections(
  user: SessionUser,
): Promise<GridSection[]> {
  const sections: GridSection[] = [];

  const tabs = await getVisibleTabs(user);
  const accessible = new Set(tabs.map((t) => t.id));

  // Personal: brood-less private/tagged tasks, plus tasks tagged to me that
  // live in a brood I can't otherwise access (so a tag truly reaches me).
  const personal = await prisma.task.findMany({
    where: {
      NOT: { values: { path: ["done"], equals: true } },
      OR: [
        { tabId: null, scope: "PRIVATE", createdById: user.id },
        { assignees: { some: { userId: user.id } } },
      ],
    },
    orderBy: { position: "asc" },
  });
  const personalRows = personal.filter(
    (t) => !(t.tabId && accessible.has(t.tabId)),
  );
  if (personalRows.length) {
    sections.push({
      tabId: null,
      tabName: "Personal",
      fields: LOOSE_FIELDS,
      rows: personalRows.map(toRow),
    });
  }

  for (const tab of tabs) {
    const fields = (await getVisibleFields(user, tab.id)).filter(
      (f) => f.type !== "person",
    );
    if (fields.length === 0) continue;
    const tasks = await getVisibleTasks(user, tab.id);
    if (tasks.length === 0) continue;
    sections.push({
      tabId: tab.id,
      tabName: tab.name,
      fields: fields.map((f) => ({
        key: f.key,
        label: f.label,
        type: f.type as string,
        options: (f.options as string[] | null) ?? [],
      })),
      rows: tasks.map(toRow),
    });
  }

  return sections;
}

/** "All Tasks": EVERYONE-scope tasks, visible to all approved members. */
export async function getEveryoneTasks(): Promise<GridRow[]> {
  const tasks = await prisma.task.findMany({
    where: {
      scope: "EVERYONE",
      NOT: { values: { path: ["done"], equals: true } },
    },
    orderBy: { position: "asc" },
  });
  return tasks.map(toRow);
}

/**
 * "All Tasks": everything the user can see — the org-wide Everyone tasks, their
 * personal/tagged tasks, and every accessible brood — grouped into sections.
 */
export async function getAllTaskSections(
  user: SessionUser,
): Promise<GridSection[]> {
  const sections: GridSection[] = [];
  const everyone = await getEveryoneTasks();
  if (everyone.length) {
    sections.push({
      tabId: null,
      tabName: "Everyone",
      fields: LOOSE_FIELDS,
      rows: everyone,
    });
  }
  sections.push(...(await getMyTaskSections(user)));
  return sections;
}

/* ---------------- Done page + shared log rows ---------------- */

export type LogRow = {
  id: string;
  title: string;
  brood: string;
  members: string[];
  at: Date;
  href: string | null;
  kind: "task" | "brood";
};

/** Completed tasks the user can see, as log rows (for the Done page). */
export async function getDoneTasks(user: SessionUser): Promise<LogRow[]> {
  const tabs = await getVisibleTabs(user);
  const accessible = new Set(tabs.map((t) => t.id));
  const admin = isAdmin(user);

  const done = await prisma.task.findMany({
    where: { values: { path: ["done"], equals: true } },
    include: {
      tab: { select: { name: true } },
      creator: { select: { name: true, nickname: true, email: true } },
      assignees: {
        include: {
          user: { select: { name: true, nickname: true, email: true } },
        },
      },
    },
    orderBy: [{ doneAt: "desc" }, { updatedAt: "desc" }],
  });

  const label = (u: {
    name: string | null;
    nickname: string | null;
    email: string | null;
  }) => u.nickname ?? u.name ?? u.email ?? "Unknown";

  const rows: LogRow[] = [];
  for (const t of done) {
    const see =
      admin ||
      t.createdById === user.id ||
      t.assignees.some((a) => a.userId === user.id) ||
      t.scope === "EVERYONE" ||
      (t.scope === "BROOD" && !!t.tabId && accessible.has(t.tabId));
    if (!see) continue;

    const v = t.values as Record<string, unknown>;
    const members = Array.from(
      new Set([
        ...(t.creator ? [label(t.creator)] : []),
        ...t.assignees.map((a) => label(a.user)),
      ]),
    );
    rows.push({
      id: t.id,
      title:
        typeof v.description === "string" && v.description
          ? v.description
          : "—",
      brood: t.tab
        ? t.tab.name
        : t.scope === "EVERYONE"
          ? "All Tasks"
          : "My Tasks",
      members,
      at: t.doneAt ?? t.updatedAt,
      href: t.tabId ? `/tab/${t.tabId}` : null,
      kind: "task",
    });
  }
  return rows;
}

/* ---------------- Notifications ---------------- */

export async function getNotifications(user: SessionUser) {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  return { items, unread };
}

/* ---------------- Admin: permission configuration ---------------- */

export type BroodAccess = {
  id: string;
  name: string;
  fields: {
    id: string;
    label: string;
    type: string;
    accessMode: FieldAccessMode;
    userIds: string[];
  }[];
};

/** Every brood with its columns + current access rules, for the People page. */
export async function getBroodAccessConfig(): Promise<BroodAccess[]> {
  const tabs = await prisma.tab.findMany({
    where: { ownerId: null, archivedAt: null }, // personal broods aren't admin-managed
    orderBy: { order: "asc" },
    select: {
      id: true,
      name: true,
      fields: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          label: true,
          type: true,
          accessMode: true,
          access: { select: { userId: true } },
        },
      },
    },
  });
  return tabs.map((t) => ({
    id: t.id,
    name: t.name,
    fields: t.fields.map((f) => ({
      id: f.id,
      label: f.label,
      type: f.type as string,
      accessMode: f.accessMode,
      userIds: f.access.map((a) => a.userId),
    })),
  }));
}
