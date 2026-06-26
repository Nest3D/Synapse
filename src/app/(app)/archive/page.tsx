import { redirect } from "next/navigation";
import { getApprovedUser, getArchivedBroods } from "@/lib/access";
import { LogList, type LogRow } from "@/components/log-list";

export const dynamic = "force-dynamic";

export default async function ArchivePage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const broods = await getArchivedBroods(user);
  const rows: LogRow[] = broods.map((b) => ({
    id: b.id,
    title: b.name,
    brood: `brood · ${b.taskCount} ${b.taskCount === 1 ? "task" : "tasks"}`,
    members: [],
    at: b.archivedAt,
    href: null,
    kind: "brood",
    personal: b.personal,
  }));

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
          Deleted broods, newest first.
        </p>
      </header>

      <LogList rows={rows} canRestoreBrood emptyLabel="No deleted broods." />
    </div>
  );
}
