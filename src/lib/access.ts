import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { resolveVisibleFieldKeys, stripValuesToVisible } from "@/lib/permissions";
import type { Role, UserStatus } from "@prisma/client";

export type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  image?: string | null;
  role?: Role;
  status?: UserStatus;
};

/** Returns the session user if signed in, else null. */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user as SessionUser;
}

/** Approved users only. Returns null otherwise (caller redirects). */
export async function getApprovedUser(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") return null;
  return user;
}

export function isAdmin(user: SessionUser | null): boolean {
  return user?.role === "admin" && user.status === "approved";
}

/** Tabs the user may see: admin -> all, member -> via membership. */
export async function getVisibleTabs(user: SessionUser) {
  if (isAdmin(user)) {
    return prisma.tab.findMany({ orderBy: { order: "asc" } });
  }
  return prisma.tab.findMany({
    where: { memberships: { some: { userId: user.id } } },
    orderBy: { order: "asc" },
  });
}

/** True if the user may access a given tab at all. */
export async function canAccessTab(
  user: SessionUser,
  tabId: string,
): Promise<boolean> {
  if (isAdmin(user)) {
    return (await prisma.tab.count({ where: { id: tabId } })) > 0;
  }
  const m = await prisma.tabMembership.count({
    where: { tabId, userId: user.id },
  });
  return m > 0;
}

/**
 * Tasks the user may see inside a tab, honoring the tab's visibility mode.
 * Throws if the user has no access to the tab at all.
 */
export async function getVisibleTasks(user: SessionUser, tabId: string) {
  const tab = await prisma.tab.findUnique({ where: { id: tabId } });
  if (!tab) throw new Error("Tab not found");

  if (!(await canAccessTab(user, tabId))) {
    throw new Error("Forbidden");
  }

  const admin = isAdmin(user);
  const tagOnly = tab.visibilityMode === "TAGGED_ONLY";

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
}

/** Whether the user may see a specific task (used by mutations). */
export async function canSeeTask(
  user: SessionUser,
  taskId: string,
): Promise<boolean> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { tab: true, assignees: true },
  });
  if (!task) return false;
  if (!(await canAccessTab(user, task.tabId))) return false;
  if (isAdmin(user)) return true;
  if (task.tab.visibilityMode === "ALL_ROWS") return true;
  return task.assignees.some((a) => a.userId === user.id);
}

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

/** Throws "Forbidden" if the user may not view/edit this field key in the tab. */
export async function assertFieldVisible(
  user: SessionUser,
  tabId: string,
  fieldKey: string,
): Promise<void> {
  const keys = await getVisibleFieldKeys(user, tabId);
  if (!keys.includes(fieldKey)) throw new Error("Forbidden");
}
