"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  TaskGrid,
  type FieldCol,
  type Row,
  type BroodOpt,
  type MemberOpt,
} from "@/components/task-grid";

export type Section = {
  tabId: string | null;
  tabName: string;
  fields: FieldCol[];
  rows: Row[];
};

/**
 * Aggregate view (My Tasks): one section per brood plus a "Personal" section
 * for brood-less tasks. Each uses the real TaskGrid so edits write through.
 */
export function SectionedGrid({
  sections,
  broods,
  members,
  emptyLabel,
}: {
  sections: Section[];
  broods: BroodOpt[];
  members: MemberOpt[];
  emptyLabel: string;
}) {
  if (sections.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-surface px-6 py-16 text-center text-sm text-faint card-float">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {sections.map((s) => (
        <section key={s.tabId ?? "personal"}>
          <div className="mb-2 flex items-center gap-2">
            {s.tabId ? (
              <Link
                href={`/tab/${s.tabId}`}
                className="group inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.2em] text-faint transition-colors hover:text-ink"
              >
                {s.tabName}
                <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
              </Link>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-faint">
                {s.tabName}
              </span>
            )}
            <span className="text-xs text-faint">
              · {s.rows.length} {s.rows.length === 1 ? "task" : "tasks"}
            </span>
          </div>
          <TaskGrid
            fields={s.fields}
            rows={s.rows}
            canEdit
            broods={broods}
            members={members}
          />
        </section>
      ))}
    </div>
  );
}
