"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  TaskGrid,
  type FieldCol,
  type Member,
  type GroupOpt,
  type Row,
} from "@/components/task-grid";

export type Section = {
  tabId: string;
  tabName: string;
  fields: FieldCol[];
  members: Member[];
  rows: Row[];
};

/**
 * Renders an aggregate view (My Tasks / a group tab) as one section per home
 * tab, each using the real TaskGrid so edits write straight through to the
 * original task. Adding rows is disabled here — tasks are born in their home tab.
 */
export function SectionedGrid({
  sections,
  groups,
  emptyLabel,
}: {
  sections: Section[];
  groups: GroupOpt[];
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
        <section key={s.tabId}>
          <div className="mb-2 flex items-center gap-2">
            <Link
              href={`/tab/${s.tabId}`}
              className="group inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.2em] text-faint transition-colors hover:text-ink"
            >
              {s.tabName}
              <ArrowUpRight className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
            <span className="text-xs text-faint">
              · {s.rows.length} {s.rows.length === 1 ? "task" : "tasks"}
            </span>
          </div>
          <TaskGrid
            tabId={s.tabId}
            fields={s.fields}
            rows={s.rows}
            members={s.members}
            groups={groups}
            canEdit
            canAdd={false}
            isAdmin={false}
          />
        </section>
      ))}
    </div>
  );
}
