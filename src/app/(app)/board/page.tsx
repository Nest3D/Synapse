import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getApprovedUser, getBoardTasks, getTaggableBroods } from "@/lib/access";
import { WeekBoard } from "@/components/week-board";
import type { TagUser } from "@/components/add-task";

export const dynamic = "force-dynamic";

export default async function BoardPage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const [tasks, users, taggableBroods] = await Promise.all([
    getBoardTasks(user),
    prisma.user.findMany({
      where: { status: "approved" },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, nickname: true, email: true },
    }),
    getTaggableBroods(user),
  ]);

  const members: TagUser[] = users
    .filter((u) => u.id !== user.id)
    .map((u) => ({
      id: u.id,
      label: u.nickname ?? u.name ?? u.email ?? "Unknown",
    }));

  return (
    <div className="animate-rise pb-[30px]">
      <header className="mb-6">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Plan
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Board
        </h1>
        <p className="mt-1 text-sm text-muted">
          Drag tasks into a day. Move and resize the windows however you like.
        </p>
      </header>

      <WeekBoard initialTasks={tasks} members={members} broods={taggableBroods} />
    </div>
  );
}
