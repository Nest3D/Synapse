"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, MessageCircle, Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { useUndo } from "@/components/undo-context";
import {
  deleteRow,
  updateCell,
  moveTask,
  restoreTask,
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
};

export type BroodOpt = { id: string; name: string };
export type MemberOpt = { id: string; label: string };

export function TaskGrid({
  fields,
  rows,
  canEdit,
  broods = [],
  members = [],
}: {
  fields: FieldCol[];
  rows: Row[];
  canEdit: boolean;
  /** Handoff destinations: broods and people. */
  broods?: BroodOpt[];
  members?: MemberOpt[];
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
                  <td className="px-3 py-2 text-center align-middle">
                    {row.source === "whatsapp" ? (
                      <MessageCircle
                        className="mx-auto h-3.5 w-3.5 text-accent"
                        aria-label="From WhatsApp"
                      />
                    ) : (
                      <span className="font-mono text-[11px] text-faint">
                        {i + 1}
                      </span>
                    )}
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
                      <div className="flex items-center justify-end gap-2">
                        {doneField && (
                          <CheckCell
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
                        {canEdit && (
                          <div className="opacity-0 transition-opacity group-hover:opacity-100">
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
                          </div>
                        )}
                        {canEdit && (
                          <button
                            onClick={() => doDelete(row.id)}
                            className="rounded-md p-1.5 text-faint opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                            aria-label="Delete row"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
