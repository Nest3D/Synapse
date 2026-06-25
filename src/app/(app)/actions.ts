"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import {
  getApprovedUser,
  canAccessTab,
  canSeeTask,
  isAdmin,
  assertFieldVisible,
} from "@/lib/access";

async function requireUser() {
  const user = await getApprovedUser();
  if (!user) throw new Error("Unauthorized");
  return user;
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

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { tabId: true, values: true },
  });
  await assertFieldVisible(user, task.tabId, fieldKey);

  const values = { ...(task.values as Record<string, unknown>) };
  values[fieldKey] = value;
  await prisma.task.update({
    where: { id: taskId },
    data: { values: values as Prisma.InputJsonObject },
  });
  revalidatePath(`/tab/${task.tabId}`);
}

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
