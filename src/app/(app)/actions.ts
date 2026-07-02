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
import { defaultDeadlines } from "@/lib/alerts";
import { after } from "next/server";
import { notifyTaskLinked } from "@/lib/task-notify";

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
  revalidatePath("/board");
  revalidatePath("/", "layout"); // notification badge
  if (tabId) revalidatePath(`/tab/${tabId}`);
}

/** Create a task from the Add-task popup and notify tagged people in-app. */
export async function createTask(input: {
  text: string;
  scope: Scope;
  tabId?: string | null;
  taggedUserIds?: string[];
  scheduledDay?: number | null;
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
      scheduledDay:
        input.scheduledDay == null
          ? null
          : Math.max(0, Math.min(6, Math.trunc(input.scheduledDay))),
      ...defaultDeadlines(),
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

  after(() =>
    notifyTaskLinked([...validTagged, user.id], {
      actorName,
      tabId,
      taskText: text,
      taskId: task.id,
    }),
  );

  refreshTaskSurfaces(tabId);
  return { id: task.id };
}

/** Restore a soft-deleted task from the Archive. */
export async function undeleteTask(taskId: string) {
  const user = await requireUser();
  const t = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, createdById: true },
  });
  if (!(await canManageLooseTask(user, t))) throw new Error("Forbidden");
  await prisma.task.update({ where: { id: taskId }, data: { deletedAt: null } });
  refreshTaskSurfaces(t.tabId);
  revalidatePath("/archive");
}

/** Permanently delete a task (from the Archive — not recoverable). */
export async function deleteTaskForever(taskId: string) {
  const user = await requireUser();
  const t = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, createdById: true },
  });
  if (!(await canManageLooseTask(user, t))) throw new Error("Forbidden");
  await prisma.task.delete({ where: { id: taskId } });
  refreshTaskSurfaces(t.tabId);
  revalidatePath("/archive");
}

/** Empty the Archive: permanently delete every archived item the user manages. */
export async function deleteAllArchived() {
  const user = await requireUser();
  const admin = isAdmin(user);
  await prisma.tab.deleteMany({
    where: {
      archivedAt: { not: null },
      OR: [{ ownerId: user.id }, ...(admin ? [{ ownerId: null }] : [])],
    },
  });
  await prisma.task.deleteMany({
    where: {
      deletedAt: { not: null },
      ...(admin ? {} : { createdById: user.id }),
    },
  });
  revalidatePath("/archive");
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout");
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

  if (notifyUserId) {
    const v = task.values as Record<string, unknown>;
    const text = typeof v.description === "string" ? v.description : "a task";
    const actorName = user.name ?? user.email ?? "Someone";
    if (notifyUserId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: notifyUserId,
          actorName,
          taskId,
          message: `${actorName} handed off to you: "${text.slice(0, 80)}"`,
        },
      });
    }
    after(() =>
      notifyTaskLinked([notifyUserId, user.id], {
        actorName,
        tabId: null, // person handoff makes the task PRIVATE (no brood)
        taskText: text,
        taskId,
      }),
    );
  }

  refreshTaskSurfaces(task.tabId);
  if (target.kind === "brood") revalidatePath(`/tab/${target.tabId}`);
  return {
    prevTabId: task.tabId,
    prevScope: task.scope as Scope,
    prevCreatedById: task.createdById,
  };
}

/** Soft-delete a task: it moves to the Archive (recoverable), not destroyed. */
export async function deleteRow(taskId: string): Promise<{ id: string }> {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");
  const found = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, createdById: true },
  });
  if (!(await canManageLooseTask(user, found))) throw new Error("Forbidden");
  await prisma.task.update({
    where: { id: taskId },
    data: { deletedAt: new Date() },
  });
  refreshTaskSurfaces(found.tabId);
  revalidatePath("/archive");
  return { id: taskId };
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

  after(() =>
    notifyTaskLinked([...toAdd, user.id], {
      actorName,
      tabId: task.tabId,
      taskText: text,
      taskId,
    }),
  );

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

/**
 * Set a task's reminder time (re-arms the due-soon email). If a weekday is given
 * (derived from the picked date in the user's local zone), the task is also
 * planned on that day of the board.
 */
export async function setTaskAlert(
  taskId: string,
  alertAtISO: string,
  weekday?: number,
) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");
  const alertAt = new Date(alertAtISO);
  if (Number.isNaN(alertAt.getTime())) throw new Error("Invalid date");
  const scheduledDay =
    weekday == null
      ? undefined
      : Math.max(0, Math.min(6, Math.trunc(weekday)));
  await prisma.task.update({
    where: { id: taskId },
    data: { alertAt, dueSoonAlertedAt: null, scheduledDay },
  });
  refreshTaskSurfaces();
}

/** Set (or clear) a task's planned weekday on the board. 0=Sunday..6=Saturday. */
export async function setTaskDay(taskId: string, day: number | null) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");
  const d =
    day == null ? null : Math.max(0, Math.min(6, Math.trunc(day)));
  await prisma.task.update({
    where: { id: taskId },
    data: { scheduledDay: d },
  });
  revalidatePath("/board");
  refreshTaskSurfaces();
}

/** Admin-only: snooze a task's alerts by a day (re-arms both reminders). */
export async function snoozeTask(taskId: string) {
  const user = await requireUser();
  if (!isAdmin(user)) throw new Error("Forbidden");
  const t = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { dueAt: true, alertAt: true },
  });
  const day = 24 * 3_600_000;
  const dueAt = new Date((t.dueAt?.getTime() ?? Date.now()) + day);
  const alertAt = t.alertAt
    ? new Date(t.alertAt.getTime() + day)
    : new Date(dueAt.getTime() - 4 * 3_600_000);
  await prisma.task.update({
    where: { id: taskId },
    data: {
      dueAt,
      alertAt,
      dueSoonAlertedAt: null,
      overdueAlertedAt: null,
    },
  });
  refreshTaskSurfaces();
}

export async function markNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath("/", "layout");
}
