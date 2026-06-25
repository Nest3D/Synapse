"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { setFieldAccess, setBroodAccess } from "@/app/(app)/admin/actions";

type Mode = "ALL" | "INCLUDE" | "EXCLUDE";

export type UserOpt = { id: string; label: string };
export type FieldRule = {
  id: string;
  label: string;
  type: string;
  accessMode: Mode;
  userIds: string[];
};
export type Brood = { id: string; name: string; fields: FieldRule[] };

const MODE_LABEL: Record<Mode, string> = {
  ALL: "Everyone",
  INCLUDE: "Only these people",
  EXCLUDE: "Everyone except",
};

/**
 * Admin permission editor (lives on the People page). For each brood, set
 * access for the whole brood at once, or column by column. Each column's rule
 * is Everyone / Only these / Everyone except over the approved users.
 */
export function BroodAccessPanel({
  broods,
  users,
}: {
  broods: Brood[];
  users: UserOpt[];
}) {
  const [openId, setOpenId] = React.useState<string | null>(
    broods[0]?.id ?? null,
  );

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="font-display text-xl font-bold tracking-tight">
          Access
        </h2>
        <p className="mt-1 text-sm text-muted">
          Who can see each brood and each of its columns. Give access to the
          whole brood, or set it column by column.
        </p>
      </div>

      {broods.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center text-sm text-faint card-float">
          No broods yet.
        </div>
      ) : (
        <div className="space-y-3">
          {broods.map((b) => (
            <div
              key={b.id}
              className="overflow-hidden rounded-xl border border-border bg-surface card-float"
            >
              <button
                onClick={() => setOpenId(openId === b.id ? null : b.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <ChevronDown
                  className="h-4 w-4 text-faint transition-transform"
                  style={{
                    transform:
                      openId === b.id ? "rotate(0deg)" : "rotate(-90deg)",
                  }}
                />
                <span className="font-display text-lg font-bold tracking-tight text-ink">
                  {b.name}
                </span>
                <span className="text-xs text-faint">
                  {b.fields.length}{" "}
                  {b.fields.length === 1 ? "column" : "columns"}
                </span>
              </button>

              <AnimatePresence initial={false}>
                {openId === b.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-t border-border-soft"
                  >
                    <div className="space-y-3 p-5">
                      <RuleEditor
                        users={users}
                        initialMode="ALL"
                        initialUserIds={[]}
                        label="Whole brood"
                        hint="Applies to every column at once."
                        onSave={(mode, ids) => setBroodAccess(b.id, mode, ids)}
                      />
                      <div className="h-px bg-border-soft" />
                      {b.fields.map((f) => (
                        <RuleEditor
                          key={f.id}
                          users={users}
                          initialMode={f.accessMode}
                          initialUserIds={f.userIds}
                          label={f.label}
                          onSave={(mode, ids) =>
                            setFieldAccess(f.id, mode, ids)
                          }
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function RuleEditor({
  users,
  initialMode,
  initialUserIds,
  label,
  hint,
  onSave,
}: {
  users: UserOpt[];
  initialMode: Mode;
  initialUserIds: string[];
  label: string;
  hint?: string;
  onSave: (mode: Mode, userIds: string[]) => Promise<void>;
}) {
  const [pending, start] = React.useTransition();
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [ids, setIds] = React.useState<string[]>(initialUserIds);

  // Re-seed when the server state changes after a save/revalidate.
  const sig = `${initialMode}:${[...initialUserIds].sort().join(",")}`;
  const [prevSig, setPrevSig] = React.useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setMode(initialMode);
    setIds(initialUserIds);
  }

  const dirty =
    mode !== initialMode ||
    ids.slice().sort().join(",") !== initialUserIds.slice().sort().join(",");

  const toggle = (id: string) =>
    setIds(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);

  return (
    <div className="rounded-lg border border-border-soft bg-surface p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-[8rem] flex-1 text-sm font-medium text-ink">
          {label}
          {hint && (
            <span className="ml-2 text-xs font-normal text-faint">{hint}</span>
          )}
        </span>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as Mode)}
          className="rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
        >
          {(["ALL", "INCLUDE", "EXCLUDE"] as const).map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          variant="secondary"
          disabled={pending || !dirty}
          onClick={() => start(() => onSave(mode, ids).then(() => {}))}
        >
          Save
        </Button>
      </div>

      {mode !== "ALL" && (
        <div className="mt-3 flex flex-wrap gap-2">
          {users.length === 0 && (
            <span className="text-xs text-faint">No approved users yet.</span>
          )}
          {users.map((u) => {
            const on = ids.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggle(u.id)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                  on
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-border text-muted hover:text-ink",
                )}
              >
                {on && <Check className="h-3 w-3" />}
                {u.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
