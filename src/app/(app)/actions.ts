"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { getApprovedUser, canAccessTab, canSeeTask, isAdmin, assertFieldVisible } from "@/lib/access";

async function requireUser() {
  const user = await getApprovedUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/** Find the `person`-type field key for a tab, if any. */
async function personFieldKey(tabId: string): Promise<string | null> {
  const f = await prisma.fieldDef.findFirst({
    where: { tabId, type: "person" },
    select: { key: true },
  });
  return f?.key ?? null;
}

export async function addRow(tabId: string) {
  const user = await requireUser();
  if (!(await canAccessTab(user, tabId))) throw new Error("Forbidden");

  const last = await prisma.task.findFirst({
    where: { tabId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await prisma.task.create({
    data: { tabId, position: (last?.position ?? 0) + 1, values: {} },
  });
  revalidatePath(`/tab/${tabId}`);
}

export async function deleteRow(taskId: string) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");
  const task = await prisma.task.delete({ where: { id: taskId } });
  revalidatePath(`/tab/${task.tabId}`);
}

export async function updateCell(
  taskId: string,
  fieldKey: string,
  value: unknown,
) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");

  const target = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true },
  });
  await assertFieldVisible(user, target.tabId, fieldKey);

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const values = { ...(task.values as Record<string, unknown>) };
  values[fieldKey] = value;
  await prisma.task.update({
    where: { id: taskId },
    data: { values: values as Prisma.InputJsonObject },
  });
  revalidatePath(`/tab/${task.tabId}`);
}

/** Set the assignees (person field) for a task and keep TaskAssignee in sync. */
export async function setAssignees(taskId: string, userIds: string[]) {
  const user = await requireUser();
  if (!(await canSeeTask(user, taskId))) throw new Error("Forbidden");

  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  // Only allow assigning users who are members of this tab.
  const valid = await prisma.tabMembership.findMany({
    where: { tabId: task.tabId, userId: { in: userIds } },
    select: { userId: true },
  });
  const validIds = valid.map((v) => v.userId);

  const key = await personFieldKey(task.tabId);
  const values = { ...(task.values as Record<string, unknown>) };
  if (key) values[key] = validIds;

  await prisma.$transaction([
    prisma.taskAssignee.deleteMany({ where: { taskId } }),
    ...validIds.map((userId) =>
      prisma.taskAssignee.create({ data: { taskId, userId } }),
    ),
    prisma.task.update({
      where: { id: taskId },
      data: { values: values as Prisma.InputJsonObject },
    }),
  ]);
  revalidatePath(`/tab/${task.tabId}`);
}

/** Admin: reorder is out of scope v1; expose simple position bump if needed. */
export async function moveRow(taskId: string, direction: "up" | "down") {
  const user = await requireUser();
  if (!isAdmin(user) && !(await canSeeTask(user, taskId)))
    throw new Error("Forbidden");
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId } });
  const neighbor = await prisma.task.findFirst({
    where: {
      tabId: task.tabId,
      position:
        direction === "up" ? { lt: task.position } : { gt: task.position },
    },
    orderBy: { position: direction === "up" ? "desc" : "asc" },
  });
  if (!neighbor) return;
  await prisma.$transaction([
    prisma.task.update({
      where: { id: task.id },
      data: { position: neighbor.position },
    }),
    prisma.task.update({
      where: { id: neighbor.id },
      data: { position: task.position },
    }),
  ]);
  revalidatePath(`/tab/${task.tabId}`);
}
