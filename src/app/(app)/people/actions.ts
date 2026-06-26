"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getApprovedUser, isAdmin } from "@/lib/access";

/** Set a person's display nickname. Allowed for that person, or any admin. */
export async function setNickname(userId: string, nickname: string) {
  const me = await getApprovedUser();
  if (!me) throw new Error("Unauthorized");
  if (me.id !== userId && !isAdmin(me)) throw new Error("Forbidden");

  const clean = nickname.trim();
  await prisma.user.update({
    where: { id: userId },
    data: { nickname: clean || null },
  });

  // Nicknames surface as the primary label across the app.
  revalidatePath("/admin/broods");
  revalidatePath("/my-tasks");
  revalidatePath("/archive");
  revalidatePath("/", "layout");
  revalidatePath("/tab/[tabId]", "page");
}
