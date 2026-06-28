import { redirect } from "next/navigation";
import {
  getApprovedUser,
  getArchivedBroods,
  getDeletedTasks,
} from "@/lib/access";
import { LogList, type LogRow } from "@/components/log-list";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const [broods, deletedTasks] = await Promise.all([
    getArchivedBroods(user),
    getDeletedTasks(user),
  ]);

  const broodRows: LogRow[] = broods.map((b) => ({
    id: b.id,
    title: b.name,
    brood: `brood · ${b.taskCount} ${b.taskCount === 1 ? "task" : "tasks"}`,
    members: [],
    at: b.archivedAt,
    href: null,
    kind: "brood",
    personal: b.personal,
  }));

  const rows: LogRow[] = [...broodRows, ...(deletedTasks as LogRow[])].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  );

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Archive
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Archive
        </h1>
        <p className="mt-1 text-sm text-muted">
          Deleted tasks and broods. Restore them, or delete forever.
        </p>
      </header>

      <LogList rows={rows} archive emptyLabel="Archive is empty." />
    </div>
  );
}
