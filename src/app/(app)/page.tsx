import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getApprovedUser,
  getAllTaskSections,
  getVisibleTabs,
  isAdmin,
} from "@/lib/access";
import { SectionedGrid, type Section } from "@/components/sectioned-grid";
import { AddTask, type TagUser } from "@/components/add-task";

export default async function AllTasksPage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const [sections, broods, users] = await Promise.all([
    getAllTaskSections(user),
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
            Everything
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            All Tasks
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your personal tasks, the org-wide ones, and every brood you can
            access.
          </p>
        </div>
        <AddTask scope="EVERYONE" users={tagUsers} />
      </div>

      <SectionedGrid
        sections={sections as unknown as Section[]}
        broods={broodOpts}
        members={tagUsers.filter((u) => u.id !== user.id)}
        isAdmin={isAdmin(user)}
        emptyLabel="No tasks yet. Add one to get started."
      />
    </div>
  );
}
