"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUndo } from "@/components/undo-context";
import { createTask, deleteTaskForever } from "@/app/(app)/actions";

export type TagUser = { id: string; label: string };
export type TagBrood = { id: string; name: string };

/**
 * "Add task" button + popup. Type the task, optionally tag people, and Push
 * (Ctrl/Cmd+Enter). Scope decides where it lands: a brood, All Tasks
 * (EVERYONE), or My Tasks (PRIVATE).
 */
export function AddTask({
  scope,
  tabId,
  users,
  broods = [],
  scheduledDay,
  compact = false,
}: {
  scope: "BROOD" | "EVERYONE" | "PRIVATE";
  tabId?: string | null;
  users: TagUser[];
  broods?: TagBrood[];
  scheduledDay?: number | null;
  compact?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [tagged, setTagged] = React.useState<string[]>([]);
  const [taggedBroods, setTaggedBroods] = React.useState<string[]>([]);
  const [pending, start] = React.useTransition();
  const { push } = useUndo();

  const close = () => {
    setOpen(false);
    setText("");
    setTagged([]);
    setTaggedBroods([]);
  };

  const submit = () => {
    if (!text.trim()) return;
    start(async () => {
      const res = await createTask({
        text,
        scope,
        tabId: tabId ?? null,
        taggedUserIds: tagged,
        taggedBroodIds: taggedBroods,
        scheduledDay: scheduledDay ?? null,
      });
      close();
      if (res?.id)
        push({ label: "add task", run: () => deleteTaskForever(res.id) });
    });
  };

  const toggle = (id: string) =>
    setTagged((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const toggleBrood = (id: string) =>
    setTaggedBroods((t) =>
      t.includes(id) ? t.filter((x) => x !== id) : [...t, id],
    );

  return (
    <>
      {compact ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-xs text-faint transition-colors hover:text-ink"
        >
          <Plus className="h-3.5 w-3.5" /> Add task
        </button>
      ) : (
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add task
        </Button>
      )}

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[12vh]"
            onClick={() => !pending && close()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 8 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="glass card-float w-full max-w-lg rounded-xl border border-border p-6"
            >
              <h2 className="font-display text-lg font-semibold">New task</h2>
              <p className="mt-1 text-xs text-muted">
                {scope === "PRIVATE"
                  ? "Only you (and anyone you tag) will see this."
                  : scope === "EVERYONE"
                    ? "Everyone on the platform will see this."
                    : "Added to this brood; tag people to push it to them."}
              </p>

              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    submit();
                  }
                }}
                rows={3}
                placeholder="What needs doing?  (Ctrl+Enter to push)"
                className="mt-4 w-full resize-none rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
              />

              {users.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
                    Tag people
                  </p>
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {users.map((u) => {
                      const on = tagged.includes(u.id);
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
                </div>
              )}

              {broods.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
                    Tag broods
                  </p>
                  <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                    {broods.map((b) => {
                      const on = taggedBroods.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBrood(b.id)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                            on
                              ? "border-accent/40 bg-accent/10 text-accent"
                              : "border-border text-muted hover:text-ink",
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1.5 text-[11px] text-faint">
                    Tagging a brood assigns everyone in it.
                  </p>
                </div>
              )}

              <div className="mt-5 flex items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={close}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={pending || !text.trim()}
                  onClick={submit}
                >
                  Push
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
