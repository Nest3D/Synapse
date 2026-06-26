import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getApprovedUser,
  getEveryoneTasks,
  getVisibleTabs,
  LOOSE_FIELDS,
} from "@/lib/access";
import { TaskGrid, type FieldCol, type Row } from "@/components/task-grid";
import { AddTask, type TagUser } from "@/components/add-task";

export default async function AllTasksPage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const [tasks, broods, users] = await Promise.all([
    getEveryoneTasks(),
    getVisibleTabs(user),
    prisma.user.findMany({
      where: { status: "approved" },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, nickname: true, email: true },
    }),
  ]);

  const tagUsers: TagUser[] = users.map((u) => ({
    id: u.id,
    label: u.nickname ?? u.name ?? u.email ?? "Unknown",
  }));
  const broodOpts = broods.map((b) => ({ id: b.id, name: b.name }));

  return (
    <div className="animate-rise">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
            Everyone
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            All Tasks
          </h1>
          <p className="mt-1 text-sm text-muted">
            Tasks everyone on the platform can see.
          </p>
        </div>
        <AddTask scope="EVERYONE" users={tagUsers} />
      </div>

      <TaskGrid
        fields={LOOSE_FIELDS as unknown as FieldCol[]}
        rows={tasks as Row[]}
        canEdit
        broods={broodOpts}
        members={tagUsers.filter((u) => u.id !== user.id)}
      />
    </div>
  );
}
