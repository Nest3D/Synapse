"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getApprovedUser,
  canAccessTab,
  canSeeTask,
  canManageLooseTask,
  assertFieldVisible,
  isAdmin,
} from "@/lib/access";

type Scope = "BROOD" | "EVERYONE" | "PRIVATE";

async function requireUser() {
  const user = await getApprovedUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

function refreshTaskSurfaces(tabId?: string | null) {
  revalidatePath("/"); // All Tasks
  revalidatePath("/my-tasks");
  revalidatePath("/done");
  revalidatePath("/", "layout"); // notification badge
  if (tabId) revalidatePath(`/tab/${tabId}`);
}

/** Create a task from the Add-task popup and notify tagged people in-app. */
export async function createTask(input: {
  text: string;
  scope: Scope;
  tabId?: string | null;
  taggedUserIds?: string[];
}) {
  const user = await requireUser();
  const text = input.text.trim();
  if (!text) throw new Error("Task text required");
  const tagged = input.taggedUserIds ?? [];

  let tabId: string | null = null;
  if (input.scope === "BROOD") {
    if (!input.tabId) throw new Error("Brood required");
    if (!(await canAccessTab(user, input.tabId))) throw new Error("Forbidden");
    tabId = input.tabId;
  }

  // Description field key: the brood's description/first-text column, else "description".
  let descKey = "description";
  if (tabId) {
    const f = await prisma.fieldDef.findFirst({
      where: { tabId, OR: [{ key: "description" }, { type: "text" }] },
      orderBy: { order: "asc" },
      select: { key: true },
    });
    descKey = f?.key ?? "description";
  }

  const validTagged = (
    await prisma.user.findMany({
      where: { id: { in: tagged }, status: "approved" },
      select: { id: true },
    })
  ).map((u) => u.id);

  const last = await prisma.task.findFirst({
    where:
      input.scope === "BROOD"
        ? { tabId }
        : { scope: input.scope, tabId: null },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const task = await prisma.task.create({
    data: {
      tabId,
      scope: input.scope,
      createdById: user.id,
      position: (last?.position ?? 0) + 1,
      values: { [descKey]: text, done: false } as Prisma.InputJsonObject,
      assignees: { create: validTagged.map((userId) => ({ userId })) },
    },
  });

  const actorName = user.name ?? user.email ?? "Someone";
  const recipients = validTagged.filter((id) => id !== user.id);
  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        actorName,
        taskId: task.id,
        message: `${actorName} tagged you: "${text.slice(0, 80)}"`,
      })),
    });
  }

  refreshTaskSurfaces(tabId);
  return { id: task.id };
}

export type TaskSnapshot = {
  tabId: string | null;
  scope: Scope;
  createdById: string | null;
  source: "manual" | "whatsapp";
  values: Record<string, unknown>;
  assigneeIds: string[];
};

/** Recreate a task from a snapshot (used to undo a delete). Returns the new id. */
export async function restoreTask(snap: TaskSnapshot) {
  const user = await requireUser();
  const allowed =
    isAdmin(user) ||
    snap.createdById === user.id ||
    (!!snap.tabId && (await canAccessTab(user, snap.tabId)));
  if (!allowed) throw new Error("Forbidden");

  const last = await prisma.task.findFirst({
    where:
      snap.tabId === null
        ? { scope: snap.scope, tabId: null }
        : { tabId: snap.tabId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const validAssignees = (
    await prisma.user.findMany({
      where: { id: { in: snap.assigneeIds } },
      select: { id: true },
    })
  ).map((u) => u.id);

  const task = await prisma.task.create({
    data: {
      tabId: snap.tabId,
      scope: snap.scope,
      createdById: snap.createdById,
      source: snap.source,
      position: (last?.position ?? 0) + 1,
      values: snap.values as Prisma.InputJsonObject,
      assignees: { create: validAssignees.map((userId) => ({ userId })) },
    },
  });
  refreshTaskSurfaces(snap.tabId);
  return { id: task.id };
}

/**
 * Hand a task off: to a brood, to All Tasks (EVERYONE), to My Tasks (PRIVATE,
 * mine), or to a specific person's board (PRIVATE owned by them + notify).
 */
export async function moveTask(
  taskId: string,
  target:
    | { kind: "brood"; tabId: string }
    | { kind: "everyone" }
    | { kind: "private" }
    | { kind: "person"; userId: string },
) {
  const user = await requireUser();
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, scope: true, createdById: true, values: true },
  });
  if (!(await canManageLooseTask(user, task))) throw new Error("Forbidden");

  let data: { tabId: string | null; scope: Scope; createdById?: string | null };
  let notifyUserId: string | null = null;

  if (target.kind === "brood") {
    if (!(await canAccessTab(user, target.tabId))) throw new Error("Forbidden");
    data = { tabId: target.tabId, scope: "BROOD" };
  } else if (target.kind === "everyone") {
    data = { tabId: null, scope: "EVERYONE" };
  } else if (target.kind === "private") {
    data = { tabId: null, scope: "PRIVATE", createdById: user.id };
  } else {
    const recipient = await prisma.user.findFirst({
      where: { id: target.userId, status: "approved" },
      select: { id: true },
    });
    if (!recipient) throw new Error("Unknown member");
    data = { tabId: null, scope: "PRIVATE", createdById: recipient.id };
    notifyUserId = recipient.id;
  }

  const last = await prisma.task.findFirst({
    where:
      data.tabId === null
        ? { scope: data.scope, tabId: null }
        : { tabId: data.tabId },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  await prisma.task.update({
    where: { id: taskId },
    data: { ...data, position: (last?.position ?? 0) + 1 },
  });

  if (notifyUserId && notifyUserId !== user.id) {
    const v = task.values as Record<string, unknown>;
    const text = typeof v.description === "string" ? v.description : "a task";
    const actorName = user.name ?? user.email ?? "Someone";
    await prisma.notification.create({
      data: {
        userId: notifyUserId,
        actorName,
        taskId,
        message: `${actorName} handed off to you: "${text.slice(0, 80)}"`,
      },
    });
  }

  refreshTaskSurfaces(task.tabId);
  if (target.kind === "brood") revalidatePath(`/tab/${target.tabId}`);
  return {
    prevTabId: task.tabId,
    prevScope: task.scope as Scope,
    prevCreatedById: task.createdById,
  };
}

export async function deleteRow(taskId: string): Promise<TaskSnapshot> {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");
  const found = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: {
      tabId: true,
      scope: true,
      createdById: true,
      source: true,
      values: true,
      assignees: { select: { userId: true } },
    },
  });
  if (!(await canManageLooseTask(user, found))) throw new Error("Forbidden");
  await prisma.task.delete({ where: { id: taskId } });
  refreshTaskSurfaces(found.tabId);
  return {
    tabId: found.tabId,
    scope: found.scope as Scope,
    createdById: found.createdById,
    source: found.source,
    values: found.values as Record<string, unknown>,
    assigneeIds: found.assignees.map((a) => a.userId),
  };
}

export async function updateCell(
  taskId: string,
  fieldKey: string,
  value: unknown,
) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, values: true, createdById: true },
  });

  if (task.tabId) {
    await assertFieldVisible(user, task.tabId, fieldKey);
  } else {
    if (!(await canManageLooseTask(user, task))) throw new Error("Forbidden");
    if (!["description", "done"].includes(fieldKey))
      throw new Error("Forbidden");
  }

  const values = { ...(task.values as Record<string, unknown>) };
  values[fieldKey] = value;
  const data: Prisma.TaskUpdateInput = {
    values: values as Prisma.InputJsonObject,
  };
  // Checking the done box moves the task to the Done page (timestamped).
  if (fieldKey === "done") data.doneAt = value ? new Date() : null;
  await prisma.task.update({ where: { id: taskId }, data });
  refreshTaskSurfaces(task.tabId);
}

/** Tag additional people on a task — they get it in their account + a notice.
 *  Unlike handoff, the task stays where it is. Returns the newly-added ids. */
export async function tagTask(
  taskId: string,
  userIds: string[],
): Promise<{ added: string[] }> {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");

  const valid = (
    await prisma.user.findMany({
      where: { id: { in: userIds }, status: "approved" },
      select: { id: true },
    })
  ).map((u) => u.id);

  const existing = new Set(
    (
      await prisma.taskAssignee.findMany({
        where: { taskId, userId: { in: valid } },
        select: { userId: true },
      })
    ).map((a) => a.userId),
  );
  const toAdd = valid.filter((id) => !existing.has(id));
  if (toAdd.length === 0) return { added: [] };

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, values: true },
  });

  await prisma.taskAssignee.createMany({
    data: toAdd.map((userId) => ({ taskId, userId })),
  });

  const v = task.values as Record<string, unknown>;
  const text = typeof v.description === "string" ? v.description : "a task";
  const actorName = user.name ?? user.email ?? "Someone";
  const recipients = toAdd.filter((id) => id !== user.id);
  if (recipients.length) {
    await prisma.notification.createMany({
      data: recipients.map((userId) => ({
        userId,
        actorName,
        taskId,
        message: `${actorName} tagged you on: "${text.slice(0, 80)}"`,
      })),
    });
  }

  refreshTaskSurfaces(task.tabId);
  return { added: toAdd };
}

/** Remove tagged people from a task (used to undo a tag). */
export async function untagTask(taskId: string, userIds: string[]) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");
  await prisma.taskAssignee.deleteMany({
    where: { taskId, userId: { in: userIds } },
  });
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { tabId: true },
  });
  refreshTaskSurfaces(task?.tabId ?? null);
}

export async function markNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath("/", "layout");
}
