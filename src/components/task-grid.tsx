"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Trash2, MessageCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select } from "@/components/ui/select";
import { deleteRow, updateCell, moveTask } from "@/app/(app)/actions";

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

export function TaskGrid({
  fields,
  rows,
  canEdit,
  broods = [],
}: {
  fields: FieldCol[];
  rows: Row[];
  canEdit: boolean;
  /** When provided, each row gets a "Move…" menu (All Tasks / My Tasks / brood). */
  broods?: BroodOpt[];
}) {
  const [, startTransition] = React.useTransition();
  const showActions = canEdit;

  const moveOptions = [
    { value: "everyone", label: "→ All Tasks" },
    { value: "private", label: "→ My Tasks" },
    ...broods.map((b) => ({ value: `brood:${b.id}`, label: `→ ${b.name}` })),
  ];

  const doMove = (taskId: string, v: string) => {
    if (!v) return;
    const target =
      v === "everyone"
        ? ({ kind: "everyone" } as const)
        : v === "private"
          ? ({ kind: "private" } as const)
          : ({ kind: "brood", tabId: v.slice("brood:".length) } as const);
    startTransition(() => moveTask(taskId, target).then(() => {}));
  };

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface card-float">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2/60">
              <th className="w-10 px-3 py-3" />
              {fields.map((f) => (
                <th
                  key={f.key}
                  className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-faint"
                >
                  {f.label}
                </th>
              ))}
              {showActions && <th className="w-44 px-3 py-3" />}
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

                  {fields.map((f) => (
                    <td key={f.key} className="px-2 py-1.5 align-middle">
                      <Cell
                        row={row}
                        field={f}
                        disabled={!canEdit}
                        onSave={(value) =>
                          startTransition(() =>
                            updateCell(row.id, f.key, value).then(() => {}),
                          )
                        }
                      />
                    </td>
                  ))}

                  {showActions && (
                    <td className="px-2 py-1.5">
                      <div className="flex items-center justify-end gap-1">
                        {broods.length >= 0 && (
                          <div className="w-28 opacity-0 transition-opacity group-hover:opacity-100">
                            <Select
                              value=""
                              placeholder="Move…"
                              variant="cell"
                              align="right"
                              ariaLabel="Move task"
                              options={moveOptions}
                              onChange={(v) => doMove(row.id, v)}
                            />
                          </div>
                        )}
                        <button
                          onClick={() =>
                            startTransition(() =>
                              deleteRow(row.id).then(() => {}),
                            )
                          }
                          className="rounded-md p-1.5 text-faint opacity-0 transition-all hover:bg-danger/10 hover:text-danger group-hover:opacity-100"
                          aria-label="Delete row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
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
