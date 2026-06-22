"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/access";
import type { FieldType, VisibilityMode } from "@prisma/client";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error("Forbidden");
  return user!;
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "field"
  );
}

/* ---- Users ---- */
export async function approveUser(userId: string) {
  await requireAdmin();
  await prisma.user.update({
    where: { id: userId },
    data: { status: "approved" },
  });
  revalidatePath("/admin/users");
}

export async function removeUser(userId: string) {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("You can't remove yourself");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/users");
}

export async function setRole(userId: string, role: "admin" | "member") {
  const admin = await requireAdmin();
  if (admin.id === userId && role === "member")
    throw new Error("You can't demote yourself");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/users");
}

export async function inviteUser(
  email: string,
  role: "admin" | "member",
  tabIds: string[],
  fieldIds: string[],
): Promise<{ error?: string }> {
  await requireAdmin();
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return { error: "Valid email required" };

  const exists = await prisma.user.findUnique({ where: { email: clean } });
  if (exists) return { error: "That email is already a user" };

  await prisma.user.create({
    data: {
      email: clean,
      role,
      status: "pending",
      memberships: { create: tabIds.map((tabId) => ({ tabId })) },
      fieldPermissions: { create: fieldIds.map((fieldId) => ({ fieldId })) },
    },
  });
  revalidatePath("/admin/users");
  return {};
}

/** Replace a user's tab memberships and field permissions wholesale. */
export async function setUserPermissions(
  userId: string,
  tabIds: string[],
  fieldIds: string[],
) {
  await requireAdmin();
  await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  await prisma.$transaction([
    prisma.tabMembership.deleteMany({ where: { userId } }),
    prisma.fieldPermission.deleteMany({ where: { userId } }),
    ...tabIds.map((tabId) =>
      prisma.tabMembership.create({ data: { userId, tabId } }),
    ),
    ...fieldIds.map((fieldId) =>
      prisma.fieldPermission.create({ data: { userId, fieldId } }),
    ),
  ]);
  revalidatePath("/admin/users");
  revalidatePath("/tab/[tabId]", "page");
}

/* ---- Tabs ---- */
export async function createTab(name: string) {
  await requireAdmin();
  const clean = name.trim();
  if (!clean) throw new Error("Name required");
  const last = await prisma.tab.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const tab = await prisma.tab.create({
    data: { name: clean, order: (last?.order ?? 0) + 1 },
  });
  // Seed the base fields requested by the user.
  await prisma.fieldDef.createMany({
    data: [
      {
        tabId: tab.id,
        key: "description",
        label: "Task description",
        type: "text",
        order: 0,
      },
      { tabId: tab.id, key: "person", label: "Person", type: "person", order: 1 },
      {
        tabId: tab.id,
        key: "category",
        label: "Category",
        type: "text",
        order: 2,
      },
      { tabId: tab.id, key: "done", label: "Done", type: "checkbox", order: 3 },
    ],
  });
  revalidatePath("/admin/tabs");
  return tab.id;
}

export async function renameTab(tabId: string, name: string) {
  await requireAdmin();
  await prisma.tab.update({ where: { id: tabId }, data: { name: name.trim() } });
  revalidatePath("/admin/tabs");
}

export async function setVisibilityMode(tabId: string, mode: VisibilityMode) {
  await requireAdmin();
  await prisma.tab.update({
    where: { id: tabId },
    data: { visibilityMode: mode },
  });
  revalidatePath("/admin/tabs");
  revalidatePath(`/tab/${tabId}`);
}

export async function deleteTab(tabId: string) {
  await requireAdmin();
  await prisma.tab.delete({ where: { id: tabId } });
  revalidatePath("/admin/tabs");
}

/* ---- Memberships ---- */
export async function addMember(tabId: string, userId: string) {
  await requireAdmin();
  await prisma.tabMembership.upsert({
    where: { userId_tabId: { userId, tabId } },
    create: { tabId, userId },
    update: {},
  });
  revalidatePath("/admin/tabs");
}

export async function removeMember(tabId: string, userId: string) {
  await requireAdmin();
  await prisma.tabMembership.deleteMany({ where: { tabId, userId } });
  // Also drop their assignments in this tab to keep things tidy.
  await prisma.taskAssignee.deleteMany({
    where: { userId, task: { tabId } },
  });
  revalidatePath("/admin/tabs");
}

/* ---- Fields ---- */
export async function addField(
  tabId: string,
  label: string,
  type: FieldType,
  options: string[] = [],
) {
  await requireAdmin();
  const clean = label.trim();
  if (!clean) throw new Error("Label required");

  // Build a unique key.
  const base = slug(clean);
  let key = base;
  let n = 1;
  while (await prisma.fieldDef.count({ where: { tabId, key } })) {
    key = `${base}_${n++}`;
  }

  const last = await prisma.fieldDef.findFirst({
    where: { tabId },
    orderBy: { order: "desc" },
    select: { order: true },
  });
  await prisma.fieldDef.create({
    data: {
      tabId,
      key,
      label: clean,
      type,
      order: (last?.order ?? 0) + 1,
      options: type === "select" ? options : undefined,
    },
  });
  revalidatePath("/admin/tabs");
  revalidatePath(`/tab/${tabId}`);
}

export async function deleteField(fieldId: string) {
  await requireAdmin();
  const f = await prisma.fieldDef.delete({ where: { id: fieldId } });
  revalidatePath("/admin/tabs");
  revalidatePath(`/tab/${f.tabId}`);
}
