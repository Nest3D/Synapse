import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  getApprovedUser,
  getVisibleTabs,
  canAccessTab,
  getVisibleTasks,
  getVisibleFields,
  getTab,
  isAdmin,
} from "@/lib/access";
import { Lock } from "lucide-react";
import { TaskGrid } from "@/components/task-grid";
import { AddTask, type TagUser } from "@/components/add-task";
import { DeleteBroodButton } from "@/components/delete-brood-button";
import { BroodPrivacyToggle } from "@/components/brood-privacy-toggle";

export default async function TabPage({
  params,
}: {
  params: Promise<{ tabId: string }>;
}) {
  const { tabId } = await params;
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const [tabs, access, tab] = await Promise.all([
    getVisibleTabs(user),
    canAccessTab(user, tabId),
    getTab(tabId),
  ]);
  if (!access || !tab) notFound();

  const [fields, tasks, users] = await Promise.all([
    getVisibleFields(user, tabId),
    getVisibleTasks(user, tabId),
    prisma.user.findMany({
      where: { status: "approved" },
      orderBy: [{ name: "asc" }],
      select: { id: true, name: true, nickname: true, email: true },
    }),
  ]);

  // Legacy person columns (tagging removed) are not rendered.
  const cols = fields.filter((f) => f.type !== "person");
  const tagUsers: TagUser[] = users.map((u) => ({
    id: u.id,
    label: u.nickname ?? u.name ?? u.email ?? "Unknown",
  }));
  const broodOpts = tabs.map((t) => ({ id: t.id, name: t.name }));

  const rows = tasks.map((t) => ({
    id: t.id,
    source: t.source,
    values: t.values as Record<string, unknown>,
    dueAt: t.dueAt,
    alertAt: t.alertAt,
    scheduledDay: t.scheduledDay,
  }));

  return (
    <div className="animate-rise">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {tab.name}
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-faint">
            {rows.length} {rows.length === 1 ? "task" : "tasks"}
          </p>
          {tab.ownerId && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[11px] text-muted">
              <Lock className="h-3 w-3" />
              Private brood — only you can see it.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isAdmin(user) &&
            (tab.ownerId === null || tab.ownerId === user.id) && (
              <BroodPrivacyToggle tabId={tabId} isPrivate={!!tab.ownerId} />
            )}
          {((isAdmin(user) && !tab.ownerId) || tab.ownerId === user.id) && (
            <DeleteBroodButton tabId={tabId} name={tab.name} />
          )}
          <AddTask scope="BROOD" tabId={tabId} users={tagUsers} />
        </div>
      </div>

      <div className="mt-6">
        <TaskGrid
          fields={cols.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            options: (f.options as string[] | null) ?? [],
          }))}
          rows={rows}
          canEdit
          broods={broodOpts}
          members={tagUsers.filter((u) => u.id !== user.id)}
          isAdmin={isAdmin(user)}
        />
      </div>
    </div>
  );
}
