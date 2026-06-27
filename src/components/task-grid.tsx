"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Trash2,
  MessageCircle,
  Check,
  Send,
  UserPlus,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useUndo } from "@/components/undo-context";
import {
  deleteRow,
  updateCell,
  moveTask,
  restoreTask,
  tagTask,
  untagTask,
  setTaskAlert,
  snoozeTask,
} from "@/app/(app)/actions";

type FieldType = "text" | "select" | "checkbox" | "person" | "date";

export type FieldCol = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
};

export type Row = {
  id: string;
  source: "manual" | "whatsapp";
  values: Record<string, unknown>;
  dueAt?: string | Date | null;
  alertAt?: string | Date | null;
  scheduledDay?: number | null;
};

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type BroodOpt = { id: string; name: string };
export type MemberOpt = { id: string; label: string };

export function TaskGrid({
  fields,
  rows,
  canEdit,
  broods = [],
  members = [],
  isAdmin = false,
}: {
  fields: FieldCol[];
  rows: Row[];
  canEdit: boolean;
  /** Handoff destinations: broods and people. */
  broods?: BroodOpt[];
  members?: MemberOpt[];
  isAdmin?: boolean;
}) {
  const [, startTransition] = React.useTransition();
  const { push } = useUndo();

  // The "done" checkbox is pulled out of the columns and shown in the actions
  // cell, next to the handoff icon.
  const doneField = fields.find((f) => f.key === "done" && f.type === "checkbox");
  const cols = doneField ? fields.filter((f) => f !== doneField) : fields;
  const showActions = canEdit || !!doneField;

  const moveOptions = [
    { value: "everyone", label: "→ All Tasks" },
    { value: "private", label: "→ My Tasks" },
    ...broods.map((b) => ({ value: `brood:${b.id}`, label: `→ ${b.name}` })),
    ...members.map((m) => ({ value: `person:${m.id}`, label: `@ ${m.label}` })),
  ];

  const parseTarget = (v: string) =>
    v.startsWith("person:")
      ? ({ kind: "person", userId: v.slice("person:".length) } as const)
      : v.startsWith("brood:")
        ? ({ kind: "brood", tabId: v.slice("brood:".length) } as const)
        : v === "everyone"
          ? ({ kind: "everyone" } as const)
          : ({ kind: "private" } as const);

  const doMove = (taskId: string, v: string) => {
    if (!v) return;
    startTransition(async () => {
      const prev = await moveTask(taskId, parseTarget(v));
      if (!prev) return;
      const back =
        prev.prevScope === "BROOD" && prev.prevTabId
          ? ({ kind: "brood", tabId: prev.prevTabId } as const)
          : prev.prevScope === "EVERYONE"
            ? ({ kind: "everyone" } as const)
            : prev.prevCreatedById
              ? ({ kind: "person", userId: prev.prevCreatedById } as const)
              : ({ kind: "private" } as const);
      push({ label: "handoff", run: () => moveTask(taskId, back) });
    });
  };

  const doEdit = (taskId: string, key: string, value: unknown, prev: unknown) =>
    startTransition(() =>
      updateCell(taskId, key, value).then(() =>
        push({ label: "edit", run: () => updateCell(taskId, key, prev) }),
      ),
    );

  const doDelete = (taskId: string) =>
    startTransition(async () => {
      const snap = await deleteRow(taskId);
      push({ label: "delete", run: () => restoreTask(snap) });
    });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface card-float">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60">
              <th className="w-10 px-3 py-3" />
              {cols.map((f) => (
                <th
                  key={f.key}
                  className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-faint"
                >
                  {f.label}
                </th>
              ))}
              {showActions && <th className="w-48 px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  layout
                  initial={{ opacity: 0, backgroundColor: "rgba(39,71,224,0.07)" }}
                  animate={{ opacity: 1, backgroundColor: "rgba(0,0,0,0)" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  className="group border-b border-border-soft last:border-0 hover:bg-surface-2/40"
                >
                  <td className="px-3 py-2 align-middle">
                    <div className="flex flex-col items-center gap-1">
                      {row.source === "whatsapp" ? (
                        <MessageCircle
                          className="h-3.5 w-3.5 text-accent"
                          aria-label="From WhatsApp"
                        />
                      ) : (
                        <span className="font-mono text-[11px] text-faint">
                          {i + 1}
                        </span>
                      )}
                      <span
                        title={
                          row.scheduledDay != null
                            ? `Planned: ${DAY_NAMES[row.scheduledDay]}`
                            : "No planned day"
                        }
                        className={cn(
                          "h-2 w-2 rounded-full",
                          row.scheduledDay != null
                            ? "bg-[#3b82f6]"
                            : "border border-border",
                        )}
                      />
                    </div>
                  </td>

                  {cols.map((f) => (
                    <td key={f.key} className="px-2 py-1.5 align-middle">
                      <Cell
                        row={row}
                        field={f}
                        disabled={!canEdit}
                        onSave={(value) =>
                          doEdit(row.id, f.key, value, row.values[f.key])
                        }
                      />
                    </td>
                  ))}

                  {showActions && (
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        {canEdit && (
                          <AlertControl
                            taskId={row.id}
                            dueAt={row.dueAt ?? null}
                            alertAt={row.alertAt ?? null}
                            isAdmin={isAdmin}
                          />
                        )}
                        {doneField && (
                          <DoneToggle
                            checked={Boolean(row.values[doneField.key])}
                            disabled={!canEdit}
                            onToggle={(v) =>
                              doEdit(
                                row.id,
                                doneField.key,
                                v,
                                row.values[doneField.key],
                              )
                            }
                          />
                        )}
                        {canEdit && members.length > 0 && (
                          <TagButton taskId={row.id} members={members} />
                        )}
                        {canEdit && (
                          <Select
                            value=""
                            variant="cell"
                            align="right"
                            ariaLabel="Handoff task"
                            iconTrigger={<Send className="h-3.5 w-3.5" />}
                            hoverLabel="Handoff"
                            options={moveOptions}
                            onChange={(v) => doMove(row.id, v)}
                          />
                        )}
                        {canEdit && (
                          <RowAction
                            icon={<Trash2 className="h-3.5 w-3.5" />}
                            label="Delete"
                            tone="danger"
                            onClick={() => doDelete(row.id)}
                          />
                        )}
                      </div>
                    </td>
                  )}
                </motion.tr>
              ))}
            </AnimatePresence>
          </tbody>
        </table>
      </div>

      {rows.length === 0 && (
        <div className="px-6 py-12 text-center text-sm text-faint">
          No tasks here yet.
        </div>
      )}
    </div>
  );
}

/* ---------------- Cell editors ---------------- */

function Cell({
  row,
  field,
  disabled,
  onSave,
}: {
  row: Row;
  field: FieldCol;
  disabled: boolean;
  onSave: (value: unknown) => void;
}) {
  const raw = row.values[field.key];

  switch (field.type) {
    case "checkbox":
      return (
        <CheckCell
          checked={Boolean(raw)}
          disabled={disabled}
          onToggle={(v) => onSave(v)}
        />
      );
    case "select":
      return (
        <SelectCell
          value={typeof raw === "string" ? raw : ""}
          options={field.options}
          disabled={disabled}
          onChange={(v) => onSave(v)}
        />
      );
    case "date":
      return (
        <input
          type="date"
          defaultValue={typeof raw === "string" ? raw : ""}
          disabled={disabled}
          onBlur={(e) => {
            if (e.target.value !== (raw ?? "")) onSave(e.target.value);
          }}
          className="w-full rounded-md bg-transparent px-2 py-1.5 font-mono text-xs text-ink outline-none focus:bg-surface-2 disabled:opacity-60"
        />
      );
    default:
      return (
        <TextCell
          value={typeof raw === "string" ? raw : raw == null ? "" : String(raw)}
          disabled={disabled}
          onSave={(v) => onSave(v)}
        />
      );
  }
}

function TextCell({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = React.useState(value);
  const [prev, setPrev] = React.useState(value);
  if (prev !== value) {
    setPrev(value);
    setLocal(value);
  }
  return (
    <input
      value={local}
      title={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => local !== value && onSave(local)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      placeholder="—"
      className="w-full min-w-[10rem] rounded-md bg-transparent px-2 py-1.5 text-ink outline-none placeholder:text-faint focus:bg-surface-2 disabled:opacity-60"
    />
  );
}

function CheckCell({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [local, setLocal] = React.useState(checked);
  const [prev, setPrev] = React.useState(checked);
  if (prev !== checked) {
    setPrev(checked);
    setLocal(checked);
  }
  return (
    <button
      disabled={disabled}
      onClick={() => {
        const next = !local;
        setLocal(next);
        onToggle(next);
      }}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-[6px] border transition-all",
        local
          ? "border-accent bg-accent text-accent-ink"
          : "border-border bg-surface-2 text-transparent hover:border-faint",
        disabled && "opacity-60",
      )}
      aria-pressed={local}
    >
      <Check className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}

/** Icon button that expands to show its label on hover (matches Handoff). */
function RowAction({
  icon,
  label,
  onClick,
  disabled,
  tone = "default",
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        "group/ra flex items-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium outline-none transition-colors disabled:opacity-60",
        tone === "danger"
          ? "text-faint hover:bg-danger/10 hover:text-danger"
          : active
            ? "text-accent hover:bg-surface-2"
            : "text-faint hover:bg-surface-2 hover:text-ink",
      )}
    >
      {icon}
      <span className="max-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 group-hover/ra:max-w-[5rem]">
        {label}
      </span>
    </button>
  );
}

/** The "done" control: a checkbox that reveals a "Done" label on hover. */
function DoneToggle({
  checked,
  disabled,
  onToggle,
}: {
  checked: boolean;
  disabled: boolean;
  onToggle: (v: boolean) => void;
}) {
  const [local, setLocal] = React.useState(checked);
  const [prev, setPrev] = React.useState(checked);
  if (prev !== checked) {
    setPrev(checked);
    setLocal(checked);
  }
  const box = (
    <span
      className={cn(
        "flex h-4 w-4 items-center justify-center rounded-[5px] border transition-all",
        local
          ? "border-accent bg-accent text-accent-ink"
          : "border-border bg-surface-2 text-transparent",
      )}
    >
      <Check className="h-3 w-3" strokeWidth={3} />
    </span>
  );
  return (
    <RowAction
      icon={box}
      label="Done"
      active={local}
      disabled={disabled}
      onClick={() => {
        const next = !local;
        setLocal(next);
        onToggle(next);
      }}
    />
  );
}

/** Per-task alert time + admin snooze (popover, clock icon). */
function AlertControl({
  taskId,
  dueAt,
  alertAt,
  isAdmin,
}: {
  taskId: string;
  dueAt: string | Date | null;
  alertAt: string | Date | null;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
    openUp: boolean;
  } | null>(null);

  const place = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const W = 240;
    const estH = 210;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < estH && r.top > spaceBelow;
    setCoords({
      top: openUp ? r.top - 6 : r.bottom + 6,
      left: Math.max(8, Math.min(window.innerWidth - W - 8, r.right - W)),
      openUp,
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    place();
    const reposition = () => place();
    const onPointer = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    document.addEventListener("mousedown", onPointer);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open, place]);

  const due = dueAt ? new Date(dueAt) : null;
  const dueMs = due ? due.getTime() : null;
  const [nowMs] = React.useState(() => Date.now());
  const overdue = dueMs != null && dueMs < nowMs;
  const toLocal = (d: Date) =>
    new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString()
      .slice(0, 16);
  const [val, setVal] = React.useState(
    alertAt ? toLocal(new Date(alertAt)) : "",
  );
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    }).format(d);

  const save = () => {
    if (!val) return;
    const d = new Date(val);
    start(() =>
      setTaskAlert(taskId, d.toISOString(), d.getDay()).then(() =>
        setOpen(false),
      ),
    );
  };
  const snooze = () =>
    start(() => snoozeTask(taskId).then(() => setOpen(false)));

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Task alert"
        className={cn(
          "group/ra flex items-center gap-1 rounded-md px-1.5 py-1.5 text-xs font-medium outline-none transition-colors hover:bg-surface-2",
          overdue ? "text-danger" : "text-faint hover:text-ink",
        )}
      >
        <Clock className="h-3.5 w-3.5" />
        <span className="max-w-0 overflow-hidden whitespace-nowrap transition-all duration-200 group-hover/ra:max-w-[5rem]">
          Alert
        </span>
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={panelRef}
            style={{
              position: "fixed",
              top: coords.openUp ? undefined : coords.top,
              bottom: coords.openUp
                ? window.innerHeight - coords.top
                : undefined,
              left: coords.left,
              width: 240,
            }}
            className="glass card-float z-[120] rounded-xl border border-border p-3 text-left shadow-xl"
          >
            <p className="text-xs text-muted">
              {due ? (
                <>
                  Due{" "}
                  <span className={overdue ? "text-danger" : "text-ink"}>
                    {fmt(due)}
                  </span>
                </>
              ) : (
                "No due time"
              )}
            </p>
            <label className="mt-2 block font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
              Alert time
            </label>
            <input
              type="datetime-local"
              value={val}
              onChange={(e) => setVal(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-accent"
            />
            {val && (
              <p className="mt-1 text-[11px] text-faint">
                Plans for{" "}
                <span className="text-[#3b82f6]">
                  {DAY_NAMES[new Date(val).getDay()]}
                </span>{" "}
                on the board
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              {isAdmin ? (
                <button
                  type="button"
                  onClick={snooze}
                  disabled={pending}
                  className="text-[11px] text-faint transition-colors hover:text-ink"
                >
                  Snooze a day
                </button>
              ) : (
                <span />
              )}
              <Button size="sm" disabled={pending || !val} onClick={save}>
                Set
              </Button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Tag additional people on a task (modal multi-select). They get a copy. */
function TagButton({
  taskId,
  members,
}: {
  taskId: string;
  members: MemberOpt[];
}) {
  const [open, setOpen] = React.useState(false);
  const [sel, setSel] = React.useState<string[]>([]);
  const [pending, start] = React.useTransition();
  const { push } = useUndo();

  const close = () => {
    setOpen(false);
    setSel([]);
  };
  const toggle = (id: string) =>
    setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const submit = () => {
    if (!sel.length) {
      close();
      return;
    }
    start(async () => {
      const res = await tagTask(taskId, sel);
      close();
      if (res?.added?.length)
        push({ label: "tag", run: () => untagTask(taskId, res.added) });
    });
  };

  return (
    <>
      <RowAction
        icon={<UserPlus className="h-3.5 w-3.5" />}
        label="Tag"
        onClick={() => setOpen(true)}
      />
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
              className="glass card-float w-full max-w-md rounded-xl border border-border p-6"
            >
              <h2 className="font-display text-lg font-semibold">Tag people</h2>
              <p className="mt-1 text-xs text-muted">
                They get this task in their account + a notification. It stays
                where it is.
              </p>
              <div className="mt-4 flex max-h-[45vh] flex-wrap gap-2 overflow-y-auto">
                {members.map((m) => {
                  const on = sel.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors",
                        on
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border text-muted hover:text-ink",
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div className="mt-5 flex justify-end gap-2">
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
                  disabled={pending || !sel.length}
                  onClick={submit}
                >
                  Tag
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function SelectCell({
  value,
  options,
  disabled,
  onChange,
}: {
  value: string;
  options: string[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <Select
      value={value}
      options={[
        { value: "", label: "—" },
        ...options.map((o) => ({ value: o, label: o })),
      ]}
      onChange={onChange}
      disabled={disabled}
      variant="cell"
      ariaLabel="Select option"
      className="min-w-[8rem]"
    />
  );
}
