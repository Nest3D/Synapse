"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, isAdmin } from "@/lib/access";
import type { FieldType, FieldAccessMode } from "@prisma/client";
import { applyMemberColumnAccess } from "@/lib/brood-access";

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
  revalidatePath("/admin/broods");
}

export async function removeUser(userId: string) {
  const admin = await requireAdmin();
  if (admin.id === userId) throw new Error("You can't remove yourself");
  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/admin/broods");
}

export async function setRole(userId: string, role: "admin" | "member") {
  const admin = await requireAdmin();
  if (admin.id === userId && role === "member")
    throw new Error("You can't demote yourself");
  await prisma.user.update({ where: { id: userId }, data: { role } });
  revalidatePath("/admin/broods");
}

export async function inviteUser(
  email: string,
  role: "admin" | "member",
): Promise<{ error?: string }> {
  await requireAdmin();
  const clean = email.trim().toLowerCase();
  if (!clean || !clean.includes("@")) return { error: "Valid email required" };

  const exists = await prisma.user.findUnique({ where: { email: clean } });
  if (exists) return { error: "That email is already a user" };

  await prisma.user.create({
    data: { email: clean, role, status: "pending" },
  });
  revalidatePath("/admin/broods");
  return {};
}

/* ---- Broods (tabs) ---- */
/**
 * Any approved member may create a brood. Admins create shared broods (everyone
 * sees, per column access); members create personal broods (owner-only).
 */
export async function createTab(name: string) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") throw new Error("Unauthorized");
  const clean = name.trim();
  if (!clean) throw new Error("Name required");
  const ownerId = isAdmin(user) ? null : user.id;
  const last = await prisma.tab.findFirst({
    orderBy: { order: "desc" },
    select: { order: true },
  });
  const tab = await prisma.tab.create({
    data: { name: clean, order: (last?.order ?? 0) + 1, ownerId },
  });
  // Seed the base columns. All columns default to ALL access.
  await prisma.fieldDef.createMany({
    data: [
      {
        tabId: tab.id,
        key: "description",
        label: "Task description",
        type: "text",
        order: 0,
      },
      {
        tabId: tab.id,
        key: "category",
        label: "Category",
        type: "text",
        order: 1,
      },
      { tabId: tab.id, key: "done", label: "Done", type: "checkbox", order: 2 },
    ],
  });
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout"); // brood bar
  return tab.id;
}

export async function renameTab(tabId: string, name: string) {
  await requireAdmin();
  await prisma.tab.update({ where: { id: tabId }, data: { name: name.trim() } });
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout");
  revalidatePath(`/tab/${tabId}`);
}

export async function deleteTab(tabId: string) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") throw new Error("Unauthorized");
  const tab = await prisma.tab.findUniqueOrThrow({
    where: { id: tabId },
    select: { ownerId: true },
  });
  // Admins delete shared broods; members delete only their own personal broods.
  const allowed =
    (isAdmin(user) && tab.ownerId === null) || tab.ownerId === user.id;
  if (!allowed) throw new Error("Forbidden");
  // Soft-delete: the brood moves to Archive instead of being destroyed.
  await prisma.tab.update({
    where: { id: tabId },
    data: { archivedAt: new Date() },
  });
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout");
  revalidatePath("/archive");
}

/**
 * Admin: turn a shared brood private (owner-only, assigned to this admin) or
 * back to shared. Only shared broods or this admin's own private brood qualify.
 */
export async function setBroodPrivacy(tabId: string, makePrivate: boolean) {
  const admin = await requireAdmin();
  const tab = await prisma.tab.findUniqueOrThrow({
    where: { id: tabId },
    select: { ownerId: true },
  });
  if (tab.ownerId !== null && tab.ownerId !== admin.id)
    throw new Error("Forbidden");
  await prisma.tab.update({
    where: { id: tabId },
    data: { ownerId: makePrivate ? admin.id : null },
  });
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout");
  revalidatePath(`/tab/${tabId}`);
}

/** Restore an archived brood (admins: shared; members: their own personal). */
export async function unarchiveTab(tabId: string) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") throw new Error("Unauthorized");
  const tab = await prisma.tab.findUniqueOrThrow({
    where: { id: tabId },
    select: { ownerId: true },
  });
  const allowed =
    (isAdmin(user) && tab.ownerId === null) || tab.ownerId === user.id;
  if (!allowed) throw new Error("Forbidden");
  await prisma.tab.update({
    where: { id: tabId },
    data: { archivedAt: null },
  });
  revalidatePath("/archive");
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout");
}

/** Permanently delete an archived brood (from the Archive — not recoverable). */
export async function deleteBroodForever(tabId: string) {
  const user = await getCurrentUser();
  if (!user || user.status !== "approved") throw new Error("Unauthorized");
  const tab = await prisma.tab.findUniqueOrThrow({
    where: { id: tabId },
    select: { ownerId: true },
  });
  const allowed =
    (isAdmin(user) && tab.ownerId === null) || tab.ownerId === user.id;
  if (!allowed) throw new Error("Forbidden");
  await prisma.tab.delete({ where: { id: tabId } });
  revalidatePath("/archive");
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout");
}

/* ---- WhatsApp aliases ---- */
export async function addWhatsAppAlias(
  keyword: string,
  target: { broodId?: string; userId?: string },
): Promise<{ error?: string }> {
  await requireAdmin();
  const key = keyword.trim().toLowerCase();
  if (!key) return { error: "Keyword required" };
  if (!target.broodId && !target.userId)
    return { error: "Pick a brood or a member" };
  const exists = await prisma.whatsAppAlias.findUnique({
    where: { keyword: key },
  });
  if (exists) return { error: "That keyword is already used" };
  await prisma.whatsAppAlias.create({
    data: {
      keyword: key,
      broodId: target.broodId ?? null,
      userId: target.userId ?? null,
    },
  });
  revalidatePath("/admin/broods");
  return {};
}

export async function deleteWhatsAppAlias(id: string) {
  await requireAdmin();
  await prisma.whatsAppAlias.delete({ where: { id } });
  revalidatePath("/admin/broods");
}

/* ---- Columns ---- */
export async function addField(
  tabId: string,
  label: string,
  type: FieldType,
  options: string[] = [],
) {
  await requireAdmin();
  const clean = label.trim();
  if (!clean) throw new Error("Label required");

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
  revalidatePath("/admin/broods");
  revalidatePath(`/tab/${tabId}`);
}

export async function deleteField(fieldId: string) {
  await requireAdmin();
  const f = await prisma.fieldDef.delete({ where: { id: fieldId } });
  revalidatePath("/admin/broods");
  revalidatePath(`/tab/${f.tabId}`);
}

/* ---- Column access (configured on the People page) ---- */

/** Refresh surfaces affected by a permission change. */
function revalidateAccess(tabId?: string) {
  revalidatePath("/admin/broods");
  revalidatePath("/", "layout"); // brood may appear/disappear from nav
  revalidatePath("/archive");
  if (tabId) revalidatePath(`/tab/${tabId}`);
  else revalidatePath("/tab/[tabId]", "page");
}

/** Set one column's access rule. ALL clears the user list. */
export async function setFieldAccess(
  fieldId: string,
  mode: FieldAccessMode,
  userIds: string[],
) {
  await requireAdmin();
  const field = await prisma.fieldDef.findUniqueOrThrow({
    where: { id: fieldId },
    select: { tabId: true },
  });

  const valid =
    mode === "ALL"
      ? []
      : (
          await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true },
          })
        ).map((u) => u.id);

  await prisma.$transaction([
    prisma.fieldDef.update({
      where: { id: fieldId },
      data: { accessMode: mode },
    }),
    prisma.fieldAccessUser.deleteMany({ where: { fieldId } }),
    ...valid.map((userId) =>
      prisma.fieldAccessUser.create({ data: { fieldId, userId } }),
    ),
  ]);
  revalidateAccess(field.tabId);
}

/** Apply one access rule to every column of a brood (the "whole brood" shortcut). */
export async function setBroodAccess(
  tabId: string,
  mode: FieldAccessMode,
  userIds: string[],
) {
  await requireAdmin();
  const fields = await prisma.fieldDef.findMany({
    where: { tabId },
    select: { id: true },
  });
  const valid =
    mode === "ALL"
      ? []
      : (
          await prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true },
          })
        ).map((u) => u.id);

  await prisma.$transaction([
    prisma.fieldDef.updateMany({
      where: { tabId },
      data: { accessMode: mode },
    }),
    prisma.fieldAccessUser.deleteMany({
      where: { fieldId: { in: fields.map((f) => f.id) } },
    }),
    ...fields.flatMap((f) =>
      valid.map((userId) =>
        prisma.fieldAccessUser.create({ data: { fieldId: f.id, userId } }),
      ),
    ),
  ]);
  revalidateAccess(tabId);
}

/** Add or remove one user's membership in a shared brood (the visibility gate). */
export async function setBroodMembership(
  tabId: string,
  userId: string,
  isMember: boolean,
) {
  await requireAdmin();
  if (isMember) {
    await prisma.broodMember.upsert({
      where: { tabId_userId: { tabId, userId } },
      create: { tabId, userId },
      update: {},
    });
  } else {
    await prisma.broodMember.deleteMany({ where: { tabId, userId } });
  }
  revalidateAccess(tabId);
}

/** Set one column's access mode (brood-wide). Switching to ALL clears its list. */
export async function setColumnMode(fieldId: string, mode: FieldAccessMode) {
  await requireAdmin();
  const field = await prisma.fieldDef.findUniqueOrThrow({
    where: { id: fieldId },
    select: { tabId: true },
  });
  await prisma.$transaction([
    prisma.fieldDef.update({ where: { id: fieldId }, data: { accessMode: mode } }),
    ...(mode === "ALL"
      ? [prisma.fieldAccessUser.deleteMany({ where: { fieldId } })]
      : []),
  ]);
  revalidateAccess(field.tabId);
}

/**
 * Toggle whether one member sees one column. Reads the column's current rule and
 * auto-converts the mode (e.g. unchecking an ALL column makes it EXCLUDE).
 */
export async function setMemberColumnAccess(
  fieldId: string,
  userId: string,
  canView: boolean,
) {
  await requireAdmin();
  const field = await prisma.fieldDef.findUniqueOrThrow({
    where: { id: fieldId },
    select: {
      tabId: true,
      accessMode: true,
      access: { select: { userId: true } },
    },
  });
  const next = applyMemberColumnAccess(
    field.accessMode,
    field.access.map((a) => a.userId),
    userId,
    canView,
  );
  await prisma.$transaction([
    prisma.fieldDef.update({
      where: { id: fieldId },
      data: { accessMode: next.mode },
    }),
    prisma.fieldAccessUser.deleteMany({ where: { fieldId } }),
    ...next.userIds.map((uid) =>
      prisma.fieldAccessUser.create({ data: { fieldId, userId: uid } }),
    ),
  ]);
  revalidateAccess(field.tabId);
}
