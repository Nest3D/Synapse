"use client";

import * as React from "react";
import {
  Search,
  Layers,
  Check,
  Lock,
  ArchiveRestore,
  Trash2,
} from "lucide-react";
import {
  updateCell,
  undeleteTask,
  deleteTaskForever,
  deleteAllArchived,
} from "@/app/(app)/actions";
import {
  unarchiveTab,
  deleteBroodForever,
} from "@/app/(app)/admin/actions";

export type LogRow = {
  id: string;
  title: string;
  brood: string;
  members: string[];
  at: string | Date;
  href: string | null;
  kind: "task" | "brood";
  personal?: boolean;
};

const dayKey = (d: Date) =>
  new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);

const time = (d: Date) =>
  new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(
    d,
  );

export function LogList({
  rows,
  emptyLabel,
  canUndone = false,
  archive = false,
}: {
  rows: LogRow[];
  emptyLabel: string;
  canUndone?: boolean;
  /** Archive mode: each row gets Restore + Delete-forever, plus a Delete-all. */
  archive?: boolean;
}) {
  const [q, setQ] = React.useState("");
  const [pending, start] = React.useTransition();

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      `${r.title} ${r.brood} ${r.members.join(" ")}`
        .toLowerCase()
        .includes(needle),
    );
  }, [q, rows]);

  const groups: { day: string; rows: LogRow[] }[] = [];
  for (const r of filtered) {
    const key = dayKey(new Date(r.at));
    const g = groups[groups.length - 1];
    if (!g || g.day !== key) groups.push({ day: key, rows: [r] });
    else g.rows.push(r);
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by task, brood, or person…"
            className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-accent"
          />
        </div>
        {archive && rows.length > 0 && (
          <button
            onClick={() => {
              if (
                confirm(
                  "Permanently delete everything in the Archive? This can't be undone.",
                )
              )
                start(() => deleteAllArchived().then(() => {}));
            }}
            disabled={pending}
            className="shrink-0 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-xs font-medium text-danger transition-colors hover:bg-danger/20 disabled:opacity-50"
          >
            Delete all
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface card-float px-6 py-12 text-center text-sm text-faint">
          {q.trim() ? "No matches." : emptyLabel}
        </div>
      ) : (
        groups.map((g) => (
          <div key={g.day} className="mb-6">
            <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
              {g.day}
            </h3>
            <div className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface card-float">
              {g.rows.map((r) => (
                <Row key={r.id} r={r} canUndone={canUndone} archive={archive} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function Row({
  r,
  canUndone,
  archive,
}: {
  r: LogRow;
  canUndone: boolean;
  archive: boolean;
}) {
  const [pending, start] = React.useTransition();

  const restore = () =>
    start(() =>
      (r.kind === "brood" ? unarchiveTab(r.id) : undeleteTask(r.id)).then(
        () => {},
      ),
    );
  const deleteForever = () => {
    if (!confirm("Permanently delete? This can't be undone.")) return;
    start(() =>
      (r.kind === "brood"
        ? deleteBroodForever(r.id)
        : deleteTaskForever(r.id)
      ).then(() => {}),
    );
  };

  return (
    <div className="group flex items-center gap-4 px-4 py-3 text-sm">
      {r.kind === "task" ? (
        canUndone ? (
          <button
            disabled={pending}
            onClick={() =>
              start(() => updateCell(r.id, "done", false).then(() => {}))
            }
            title="Mark not done"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-accent bg-accent text-accent-ink"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
          </button>
        ) : (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-faint">
            <Trash2 className="h-3 w-3" />
          </span>
        )
      ) : (
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-border bg-surface-2 text-faint">
          <Layers className="h-3.5 w-3.5" />
        </span>
      )}

      <span className="min-w-0 flex-1 truncate text-ink">{r.title}</span>

      {r.personal && (
        <Lock className="hidden h-3 w-3 shrink-0 text-faint sm:block" />
      )}

      {r.members.length > 0 && (
        <span className="hidden max-w-[12rem] shrink-0 truncate text-xs text-muted md:block">
          {r.members.map((m) => m.split(" ")[0]).join(", ")}
        </span>
      )}

      <span className="shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-faint">
        {r.brood}
      </span>

      <span className="hidden shrink-0 font-mono text-[11px] text-faint md:block">
        {time(new Date(r.at))}
      </span>

      {archive && (
        <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <button
            onClick={restore}
            disabled={pending}
            title="Restore"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-faint transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            <ArchiveRestore className="h-3.5 w-3.5" /> Restore
          </button>
          <button
            onClick={deleteForever}
            disabled={pending}
            title="Delete forever"
            className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger disabled:opacity-50"
            aria-label="Delete forever"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
