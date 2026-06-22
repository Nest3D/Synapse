import { redirect } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { getApprovedUser, getArchivedTasks } from "@/lib/access";

export const dynamic = "force-dynamic";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export default async function ArchivePage() {
  const user = await getApprovedUser();
  if (!user) redirect("/login");

  const tasks = await getArchivedTasks(user);

  return (
    <div className="animate-rise">
      <header className="mb-8">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-faint">
          Archive
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
          Done tasks
        </h1>
        <p className="mt-1 text-sm text-muted">
          {tasks.length} completed {tasks.length === 1 ? "task" : "tasks"} across
          your tabs.
        </p>
      </header>

      {tasks.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface card-float px-6 py-12 text-center text-sm text-faint">
          Nothing completed yet.
        </div>
      ) : (
        <div className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface card-float">
          {tasks.map((t) => (
            <Link
              key={t.id}
              href={`/tab/${t.tabId}`}
              className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-surface-2/40"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-accent bg-accent text-accent-ink">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>

              <span className="min-w-0 flex-1 truncate text-ink">
                {t.description || <span className="text-faint">—</span>}
              </span>

              {t.assignees.length > 0 && (
                <span className="hidden shrink-0 truncate text-xs text-muted sm:block">
                  {t.assignees.map((a) => a.name.split(" ")[0]).join(", ")}
                </span>
              )}

              <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-faint">
                {t.tabName}
              </span>

              <span className="hidden shrink-0 font-mono text-[11px] text-faint md:block">
                {formatDate(t.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
