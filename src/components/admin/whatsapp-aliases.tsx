"use client";

import * as React from "react";
import { Plus, Trash2, Hash, AtSign } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  addWhatsAppAlias,
  deleteWhatsAppAlias,
} from "@/app/(app)/admin/actions";

export type AliasRow = {
  id: string;
  keyword: string;
  target: string;
  kind: "brood" | "member";
};
export type LogRow = {
  id: string;
  text: string;
  status: string;
  error: string | null;
  placement: string | null;
  at: string | Date;
};

export function WhatsAppAliases({
  aliases,
  broods,
  members,
  logs,
}: {
  aliases: AliasRow[];
  broods: { id: string; name: string }[];
  members: { id: string; label: string }[];
  logs: LogRow[];
}) {
  const [keyword, setKeyword] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const options = [
    ...broods.map((b) => ({ value: `brood:${b.id}`, label: `# ${b.name}` })),
    ...members.map((m) => ({ value: `member:${m.id}`, label: `@ ${m.label}` })),
  ];

  const submit = () => {
    setError(null);
    if (!keyword.trim() || !target) return;
    const t = target.startsWith("brood:")
      ? { broodId: target.slice("brood:".length) }
      : { userId: target.slice("member:".length) };
    start(async () => {
      const res = await addWhatsAppAlias(keyword, t);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setKeyword("");
      setTarget("");
    });
  };

  return (
    <div>
      <p className="mb-4 text-sm text-muted">
        Shortcuts a message can start with to route a task. A message&apos;s
        first word picks the destination: a <strong>brood</strong> drops the task
        there; a <strong>member</strong> puts it on their board. e.g. alias{" "}
        <code className="rounded bg-surface-2 px-1">mkt</code> → Marketing, then
        texting <code className="rounded bg-surface-2 px-1">mkt fix the logo</code>.
      </p>

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface card-float p-3">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="keyword (e.g. mkt)"
          className="w-40 rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
        />
        <span className="text-faint">→</span>
        <Select
          value={target}
          onChange={setTarget}
          options={options}
          placeholder="brood or member"
          ariaLabel="Alias target"
          className="w-56"
        />
        <Button size="sm" disabled={pending || !keyword.trim() || !target} onClick={submit}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
        {error && <span className="text-sm text-danger">{error}</span>}
      </div>

      {aliases.length > 0 && (
        <div className="mb-8 divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface card-float">
          {aliases.map((a) => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <code className="rounded bg-surface-2 px-1.5 py-0.5 text-ink">
                {a.keyword}
              </code>
              <span className="text-faint">→</span>
              <span className="inline-flex items-center gap-1 text-muted">
                {a.kind === "brood" ? (
                  <Hash className="h-3.5 w-3.5" />
                ) : (
                  <AtSign className="h-3.5 w-3.5" />
                )}
                {a.target}
              </span>
              <button
                onClick={() => start(() => deleteWhatsAppAlias(a.id).then(() => {}))}
                className="ml-auto rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                aria-label="Delete alias"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <h3 className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-faint">
        Recent activity
      </h3>
      {logs.length === 0 ? (
        <p className="rounded-xl border border-border bg-surface card-float px-4 py-8 text-center text-sm text-faint">
          No WhatsApp messages yet.
        </p>
      ) : (
        <div className="divide-y divide-border-soft overflow-hidden rounded-xl border border-border bg-surface card-float">
          {logs.map((l) => (
            <div key={l.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              <span
                className={cn(
                  "h-1.5 w-1.5 shrink-0 rounded-full",
                  l.status === "ok" ? "bg-accent" : "bg-danger",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-ink">{l.text}</span>
              <span className="shrink-0 text-xs text-faint">
                {l.status === "ok" ? `→ ${l.placement ?? "added"}` : l.error}
              </span>
              <span className="hidden shrink-0 font-mono text-[11px] text-faint sm:block">
                {new Intl.DateTimeFormat("en", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                }).format(new Date(l.at))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
