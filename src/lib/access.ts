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

/** Columns a user may VIEW in a brood (ordered), honoring each column's rule. */
export const getVisibleFields = cache(
  async (user: SessionUser, tabId: string) => {
    const tab = (await getTabsWithFields()).find((t) => t.id === tabId);
    if (!tab) return [];
    const admin = isAdmin(user);
    return tab.fields.filter((f) =>
      fieldVisible(admin, f.accessMode, f.access.map((a) => a.userId), user.id),
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

/** Broods the user may see: those with ≥1 visible column (admin → all). Cached. */
export const getVisibleTabs = cache(async (user: SessionUser) => {
  const tabs = await getTabsWithFields();
  if (isAdmin(user)) return tabs;
  return tabs.filter((t) =>
    t.fields.some((f) =>
      fieldVisible(false, f.accessMode, f.access.map((a) => a.userId), user.id),
    ),
  );
});

/** True if the user may access a given brood at all. Cached per request. */
export const canAccessTab = cache(
  async (user: SessionUser, tabId: string): Promise<boolean> => {
    const tabs = await getTabsWithFields();
    const tab = tabs.find((t) => t.id === tabId);
    if (!tab) return false;
    if (isAdmin(user)) return true;
    return tab.fields.some((f) =>
      fieldVisible(false, f.accessMode, f.access.map((a) => a.userId), user.id),
    );
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
    where: { tabId },
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
    select: { tabId: true },
  });
  if (!task) return false;
  return canAccessTab(user, task.tabId);
}

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

/* ---------------- My Tasks (aggregate across accessible broods) ---------------- */

export type GridSection = {
  tabId: string;
  tabName: string;
  fields: { key: string; label: string; type: string; options: string[] }[];
  rows: {
    id: string;
    source: "manual" | "whatsapp";
    values: Record<string, unknown>;
  }[];
};

/**
 * Every task the user can see, across every brood they can access, grouped by
 * brood. Access to a brood == being tagged to its tasks, so this is the user's
 * personal cross-brood task list. Only broods with visible tasks are included.
 */
export async function getMyTaskSections(
  user: SessionUser,
): Promise<GridSection[]> {
  const tabs = await getVisibleTabs(user);
  const sections: GridSection[] = [];

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
      rows: tasks.map((t) => ({
        id: t.id,
        source: t.source,
        values: t.values as Record<string, unknown>,
      })),
    });
  }

  return sections;
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
