import { cache } from "react";
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
 * Prisma `where` fragment: a task is "tagged" for a user if they're a direct
 * assignee OR a member of a group tagged on the task. This is the single rule
 * used everywhere visibility is computed (home tabs, My Tasks, group tabs).
 */
export function taggedForUserWhere(userId: string) {
  return {
    OR: [
      { assignees: { some: { userId } } },
      { groupTags: { some: { group: { members: { some: { userId } } } } } },
    ],
  };
}

/** Tabs the user may see: admin -> all, member -> via membership. Cached. */
export const getVisibleTabs = cache(async (user: SessionUser) => {
  if (isAdmin(user)) {
    return prisma.tab.findMany({ orderBy: { order: "asc" } });
  }
  return prisma.tab.findMany({
    where: { memberships: { some: { userId: user.id } } },
    orderBy: { order: "asc" },
  });
});

/** A single tab by id, cached per request (shared across access checks). */
export const getTab = cache((tabId: string) =>
  prisma.tab.findUnique({ where: { id: tabId } }),
);

/** True if the user may access a given tab at all. Cached per request. */
export const canAccessTab = cache(
  async (user: SessionUser, tabId: string): Promise<boolean> => {
    if (isAdmin(user)) {
      return (await prisma.tab.count({ where: { id: tabId } })) > 0;
    }
    const m = await prisma.tabMembership.count({
      where: { tabId, userId: user.id },
    });
    return m > 0;
  },
);

/**
 * Tasks the user may see inside a tab, honoring the tab's visibility mode.
 * Throws if the user has no access to the tab at all.
 */
export async function getVisibleTasks(user: SessionUser, tabId: string) {
  const tab = await getTab(tabId);
  if (!tab) throw new Error("Tab not found");

  if (!(await canAccessTab(user, tabId))) {
    throw new Error("Forbidden");
  }

  const admin = isAdmin(user);
  const tagOnly = tab.visibilityMode === "TAGGED_ONLY";

  const tasks = await prisma.task.findMany({
    where: {
      tabId,
      ...(admin || !tagOnly ? {} : taggedForUserWhere(user.id)),
    },
    include: {
      assignees: { include: { user: true } },
      groupTags: { select: { groupId: true } },
    },
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
    include: {
      tab: true,
      assignees: true,
      groupTags: { select: { group: { select: { members: { select: { userId: true } } } } } },
    },
  });
  if (!task) return false;
  if (!(await canAccessTab(user, task.tabId))) return false;
  if (isAdmin(user)) return true;
  if (task.tab.visibilityMode === "ALL_ROWS") return true;
  if (task.assignees.some((a) => a.userId === user.id)) return true;
  return task.groupTags.some((gt) =>
    gt.group.members.some((m) => m.userId === user.id),
  );
}

/**
 * Field definitions a user may VIEW in a tab (ordered). Admin sees all;
 * a user with no FieldPermission rows for the tab sees all; otherwise only granted.
 */
export const getVisibleFields = cache(
  async (user: SessionUser, tabId: string) => {
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
  },
);

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

export type ArchivedTask = {
  id: string;
  tabId: string;
  tabName: string;
  description: string;
  assignees: { id: string; name: string; image: string | null }[];
  updatedAt: Date;
};

/**
 * Every "done" task across the tabs the user may see, honoring tab access and
 * row visibility (TAGGED_ONLY → only rows they're assigned to, unless admin).
 * Sorted newest-completed first.
 */
export async function getArchivedTasks(
  user: SessionUser,
): Promise<ArchivedTask[]> {
  const tabs = await getVisibleTabs(user);
  const admin = isAdmin(user);
  const out: ArchivedTask[] = [];

  for (const tab of tabs) {
    const tagOnly = tab.visibilityMode === "TAGGED_ONLY";
    const tasks = await prisma.task.findMany({
      where: {
        tabId: tab.id,
        values: { path: ["done"], equals: true },
        ...(admin || !tagOnly ? {} : taggedForUserWhere(user.id)),
      },
      include: {
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                nickname: true,
                email: true,
                image: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    for (const t of tasks) {
      const values = t.values as Record<string, unknown>;
      out.push({
        id: t.id,
        tabId: tab.id,
        tabName: tab.name,
        description:
          typeof values["description"] === "string"
            ? (values["description"] as string)
            : "",
        assignees: t.assignees.map((a) => ({
          id: a.user.id,
          name: a.user.nickname ?? a.user.name ?? a.user.email ?? "Unknown",
          image: a.user.image,
        })),
        updatedAt: t.updatedAt,
      });
    }
  }

  out.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  return out;
}

/* ---------------- Groups ---------------- */

/** Top-bar navigation for a user: visible tabs + the groups they belong to. */
export const getNavForUser = cache(async (user: SessionUser) => {
  const [tabs, groups, record] = await Promise.all([
    getVisibleTabs(user),
    prisma.group.findMany({
      where: { members: { some: { userId: user.id } } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: { nickname: true },
    }),
  ]);
  return { tabs, groups, nickname: record?.nickname ?? null };
});

/** Groups that can be tagged on a task (all groups; with member counts). */
export const getTaggableGroups = cache(async () =>
  prisma.group.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { members: true } } },
  }),
);

/** A user may VIEW a group's tab if they're a member, or an admin. */
export async function canViewGroup(
  user: SessionUser,
  groupId: string,
): Promise<boolean> {
  if (isAdmin(user)) return (await prisma.group.count({ where: { id: groupId } })) > 0;
  return (
    (await prisma.groupMembership.count({
      where: { groupId, userId: user.id },
    })) > 0
  );
}

/** A user may EDIT a group (rename/delete/membership) if creator or admin. */
export async function canEditGroup(
  user: SessionUser,
  groupId: string,
): Promise<boolean> {
  if (isAdmin(user)) return true;
  const g = await prisma.group.findUnique({
    where: { id: groupId },
    select: { createdById: true },
  });
  return g?.createdById === user.id;
}

/* ---------------- Virtual aggregate views (My Tasks / group tabs) ---------------- */

export type GridSection = {
  tabId: string;
  tabName: string;
  fields: { key: string; label: string; type: string; options: string[] }[];
  members: { id: string; name: string; image: string | null }[];
  rows: {
    id: string;
    source: "manual" | "whatsapp";
    values: Record<string, unknown>;
    assignees: string[];
    groups: string[];
  }[];
};

type RawTask = {
  id: string;
  tabId: string;
  source: "manual" | "whatsapp";
  values: unknown;
  assignees: { userId: string }[];
  groupTags: { groupId: string }[];
};

/**
 * Group an aggregate task list by home tab and render each section with that
 * tab's visible fields, member roster, and per-field-permission value masking.
 * Sections are ordered by the tab's display order.
 */
async function buildSections(
  user: SessionUser,
  tasks: RawTask[],
): Promise<GridSection[]> {
  const byTab = new Map<string, RawTask[]>();
  for (const t of tasks) {
    const list = byTab.get(t.tabId);
    if (list) list.push(t);
    else byTab.set(t.tabId, [t]);
  }

  const sections: { order: number; section: GridSection }[] = [];
  for (const [tabId, group] of byTab) {
    const tab = await getTab(tabId);
    if (!tab) continue;
    const fields = await getVisibleFields(user, tabId);
    const personVisible = fields.some((f) => f.type === "person");
    const visibleKeys = fields.map((f) => f.key);

    const members = personVisible
      ? (
          await prisma.tabMembership.findMany({
            where: { tabId },
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  nickname: true,
                  email: true,
                  image: true,
                },
              },
            },
          })
        ).map((m) => ({
          id: m.user.id,
          name: m.user.nickname ?? m.user.name ?? m.user.email ?? "Unknown",
          image: m.user.image,
        }))
      : [];

    sections.push({
      order: tab.order,
      section: {
        tabId,
        tabName: tab.name,
        fields: fields.map((f) => ({
          key: f.key,
          label: f.label,
          type: f.type as string,
          options: (f.options as string[] | null) ?? [],
        })),
        members,
        rows: group.map((t) => ({
          id: t.id,
          source: t.source,
          values: stripValuesToVisible(
            t.values as Record<string, unknown>,
            visibleKeys,
          ),
          assignees: personVisible ? t.assignees.map((a) => a.userId) : [],
          groups: personVisible ? t.groupTags.map((g) => g.groupId) : [],
        })),
      },
    });
  }

  sections.sort((a, b) => a.order - b.order);
  return sections.map((s) => s.section);
}

/** "My Tasks": every task across all tabs the user is tagged on (direct or via a group). */
export async function getMyTaskSections(
  user: SessionUser,
): Promise<GridSection[]> {
  const tasks = await prisma.task.findMany({
    where: taggedForUserWhere(user.id),
    include: {
      assignees: { select: { userId: true } },
      groupTags: { select: { groupId: true } },
    },
    orderBy: [{ tabId: "asc" }, { position: "asc" }],
  });
  return buildSections(user, tasks as RawTask[]);
}

/** A group tab: every task this group is tagged on, grouped by home tab. */
export async function getGroupTaskSections(
  user: SessionUser,
  groupId: string,
): Promise<GridSection[]> {
  const tasks = await prisma.task.findMany({
    where: { groupTags: { some: { groupId } } },
    include: {
      assignees: { select: { userId: true } },
      groupTags: { select: { groupId: true } },
    },
    orderBy: [{ tabId: "asc" }, { position: "asc" }],
  });
  return buildSections(user, tasks as RawTask[]);
}
