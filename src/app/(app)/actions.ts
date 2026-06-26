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
}

/** Move a task to a brood, to All Tasks (EVERYONE), or to My Tasks (PRIVATE). */
export async function moveTask(
  taskId: string,
  target: { kind: "brood"; tabId: string } | { kind: "everyone" } | { kind: "private" },
) {
  const user = await requireUser();
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, createdById: true },
  });
  if (!(await canManageLooseTask(user, task))) throw new Error("Forbidden");

  let data: { tabId: string | null; scope: Scope };
  if (target.kind === "brood") {
    if (!(await canAccessTab(user, target.tabId))) throw new Error("Forbidden");
    data = { tabId: target.tabId, scope: "BROOD" };
  } else if (target.kind === "everyone") {
    data = { tabId: null, scope: "EVERYONE" };
  } else {
    data = { tabId: null, scope: "PRIVATE" };
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

  refreshTaskSurfaces(task.tabId);
  if (target.kind === "brood") revalidatePath(`/tab/${target.tabId}`);
}

export async function deleteRow(taskId: string) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");
  const found = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, createdById: true },
  });
  if (!(await canManageLooseTask(user, found))) throw new Error("Forbidden");
  await prisma.task.delete({ where: { id: taskId } });
  refreshTaskSurfaces(found.tabId);
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
  await prisma.task.update({
    where: { id: taskId },
    data: { values: values as Prisma.InputJsonObject },
  });
  refreshTaskSurfaces(task.tabId);
}

export async function markNotificationsRead() {
  const user = await requireUser();
  await prisma.notification.updateMany({
    where: { userId: user.id, read: false },
    data: { read: true },
  });
  revalidatePath("/", "layout");
}
