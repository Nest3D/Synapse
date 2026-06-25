import { notFound, redirect } from "next/navigation";
import {
  getApprovedUser,
  getVisibleTabs,
  canAccessTab,
  getVisibleTasks,
  getVisibleFields,
  getTab,
} from "@/lib/access";
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

  const [fields, tasks] = await Promise.all([
    getVisibleFields(user, tabId),
    getVisibleTasks(user, tabId),
  ]);

  // Legacy person columns (tagging removed) are not rendered.
  const cols = fields.filter((f) => f.type !== "person");

  const rows = tasks.map((t) => ({
    id: t.id,
    source: t.source,
    values: t.values as Record<string, unknown>,
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
            {rows.length} {rows.length === 1 ? "task" : "tasks"}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <TaskGrid
          tabId={tabId}
          fields={cols.map((f) => ({
            key: f.key,
            label: f.label,
            type: f.type,
            options: (f.options as string[] | null) ?? [],
          }))}
          rows={rows}
          canEdit
        />
      </div>
    </div>
  );
}
