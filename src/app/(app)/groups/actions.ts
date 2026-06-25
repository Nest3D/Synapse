"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getApprovedUser, canEditGroup } from "@/lib/access";

async function requireUser() {
  const user = await getApprovedUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

/** Refresh everything a group change can affect: People page, nav, virtual views. */
function revalidateGroupSurfaces(groupId?: string) {
  revalidatePath("/people");
  revalidatePath("/my-tasks");
  revalidatePath("/", "layout"); // nav (group tabs) on every page
  if (groupId) revalidatePath(`/group/${groupId}`);
}

/** Any approved member may create a group; they become its owner. */
export async function createGroup(
  name: string,
  memberIds: string[] = [],
): Promise<{ id?: string; error?: string }> {
  const user = await requireUser();
  const clean = name.trim();
  if (!clean) return { error: "Name required" };

  // Owner is always a member; de-dupe the rest.
  const members = Array.from(new Set([user.id, ...memberIds]));
  const valid = await prisma.user.findMany({
    where: { id: { in: members } },
    select: { id: true },
  });

  const group = await prisma.group.create({
    data: {
      name: clean,
      createdById: user.id,
      members: { create: valid.map((u) => ({ userId: u.id })) },
    },
  });
  revalidateGroupSurfaces(group.id);
  return { id: group.id };
}

export async function renameGroup(groupId: string, name: string) {
  const user = await requireUser();
  if (!(await canEditGroup(user, groupId))) throw new Error("Forbidden");
  const clean = name.trim();
  if (!clean) throw new Error("Name required");
  await prisma.group.update({ where: { id: groupId }, data: { name: clean } });
  revalidateGroupSurfaces(groupId);
}

export async function deleteGroup(groupId: string) {
  const user = await requireUser();
  if (!(await canEditGroup(user, groupId))) throw new Error("Forbidden");
  await prisma.group.delete({ where: { id: groupId } });
  revalidateGroupSurfaces(groupId);
}

/** Replace a group's membership wholesale. Creator/admin only. */
export async function setGroupMembers(groupId: string, userIds: string[]) {
  const user = await requireUser();
  if (!(await canEditGroup(user, groupId))) throw new Error("Forbidden");

  const valid = await prisma.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true },
  });

  await prisma.$transaction([
    prisma.groupMembership.deleteMany({ where: { groupId } }),
    ...valid.map((u) =>
      prisma.groupMembership.create({ data: { groupId, userId: u.id } }),
    ),
  ]);
  revalidateGroupSurfaces(groupId);
}
