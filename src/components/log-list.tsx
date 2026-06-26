"use client";

import * as React from "react";
import { Search, Layers, Check, Lock, ArchiveRestore } from "lucide-react";
import { cn } from "@/lib/utils";
import { updateCell } from "@/app/(app)/actions";
import { unarchiveTab } from "@/app/(app)/admin/actions";

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
  canRestoreBrood = false,
}: {
  rows: LogRow[];
  emptyLabel: string;
  canUndone?: boolean;
  canRestoreBrood?: boolean;
}) {
  const [q, setQ] = React.useState("");

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
      <div className="relative mb-5">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by task, brood, or person…"
          className="w-full rounded-lg border border-border bg-surface py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-accent"
        />
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
                <Row
                  key={r.id}
                  r={r}
                  canUndone={canUndone}
                  canRestoreBrood={canRestoreBrood}
                />
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
  canRestoreBrood,
}: {
  r: LogRow;
  canUndone: boolean;
  canRestoreBrood: boolean;
}) {
  const [pending, start] = React.useTransition();

  return (
    <div className="group flex items-center gap-4 px-4 py-3 text-sm">
      {r.kind === "task" ? (
        <button
          disabled={!canUndone || pending}
          onClick={() =>
            canUndone &&
            start(() => updateCell(r.id, "done", false).then(() => {}))
          }
          title={canUndone ? "Mark not done" : undefined}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border border-accent bg-accent text-accent-ink disabled:opacity-100"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </button>
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

      <span
        className={cn(
          "shrink-0 rounded-full border border-border bg-surface-2 px-2 py-0.5 font-mono text-[11px] text-faint",
        )}
      >
        {r.brood}
      </span>

      <span className="hidden shrink-0 font-mono text-[11px] text-faint md:block">
        {time(new Date(r.at))}
      </span>

      {r.kind === "brood" && canRestoreBrood && (
        <button
          onClick={() => start(() => unarchiveTab(r.id).then(() => {}))}
          disabled={pending}
          title="Restore brood"
          className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-faint opacity-0 transition-all hover:bg-surface-2 hover:text-ink group-hover:opacity-100 disabled:opacity-50"
        >
          <ArchiveRestore className="h-3.5 w-3.5" /> Restore
        </button>
      )}
    </div>
  );
}
