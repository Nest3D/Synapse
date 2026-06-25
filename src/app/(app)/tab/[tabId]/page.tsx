import { notFound, redirect } from "next/navigation";
import {
  getApprovedUser,
  getVisibleTabs,
  canAccessTab,
  getVisibleTasks,
  getVisibleFields,
  getTab,
  getTaggableGroups,
  isAdmin,
} from "@/lib/access";
import { prisma } from "@/lib/prisma";
import { TabBar } from "@/components/tab-bar";
import { TaskGrid } from "@/components/task-grid";

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

  const [fields, tasks, members] = await Promise.all([
    getVisibleFields(user, tabId),
    getVisibleTasks(user, tabId),
    prisma.tabMembership.findMany({
      where: { tabId },
      include: { user: { select: { id: true, name: true, email: true, image: true } } },
    }),
  ]);

  // The person column (and its assignee data / member roster) is only sent to
  // the client when the user may actually view the person field.
  const personVisible = fields.some((f) => f.type === "person");

  const memberOptions = personVisible
    ? members.map((m) => ({
        id: m.user.id,
        name: m.user.name ?? m.user.email ?? "Unknown",
        image: m.user.image,
      }))
    : [];

  const groupOptions = personVisible
    ? (await getTaggableGroups()).map((g) => ({
        id: g.id,
        name: g.name,
        count: g._count.members,
      }))
    : [];

  const rows = tasks.map((t) => ({
    id: t.id,
    source: t.source,
    values: t.values as Record<string, unknown>,
    assignees: personVisible ? t.assignees.map((a) => a.userId) : [],
    groups: personVisible ? t.groupTags.map((g) => g.groupId) : [],
  }));

  return (
    <div className="animate-rise">
      <TabBar
        tabs={tabs.map((t) => ({ id: t.id, name: t.name }))}
        activeId={tabId}
      />

      <div className="mt-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">
            {tab.name}
          </h1>
          <p className="mt-1 font-mono text-xs uppercase tracking-[0.2em] text-faint">
            {tab.visibilityMode === "TAGGED_ONLY"
              ? "tagged rows only"
              : "all rows visible"}{" "}
            · {rows.length} {rows.length === 1 ? "task" : "tasks"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <TaskGrid
          tabId={tabId}
          fields={fields.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            options: (f.options as string[] | null) ?? [],
          }))}
          rows={rows}
          members={memberOptions}
          groups={groupOptions}
          canEdit
          isAdmin={isAdmin(user)}
        />
      </div>
    </div>
  );
}
