"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, MessageCircle, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  addRow,
  deleteRow,
  updateCell,
  setAssignees,
} from "@/app/(app)/actions";

type FieldType = "text" | "select" | "checkbox" | "person" | "date";

export type FieldCol = {
  key: string;
  label: string;
  type: FieldType;
  options: string[];
};

export type Member = { id: string; name: string; image?: string | null };

export type Row = {
  id: string;
  source: "manual" | "whatsapp";
  values: Record<string, unknown>;
  assignees: string[];
};

export function TaskGrid({
  tabId,
  fields,
  rows,
  members,
  canEdit,
}: {
  tabId: string;
  fields: FieldCol[];
  rows: Row[];
  members: Member[];
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [pending, startTransition] = React.useTransition();

  const personField = fields.find((f) => f.type === "person");

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/30">
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
              {canEdit && <th className="w-12 px-3 py-3" />}
            </tr>
          </thead>
          <tbody>
            <AnimatePresence initial={false}>
              {rows.map((row, i) => (
                <motion.tr
                  key={row.id}
                  layout
                  initial={{ opacity: 0, backgroundColor: "rgba(200,242,78,0.06)" }}
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
                        members={members}
                        disabled={!canEdit || pending}
                        onSave={(value) =>
                          startTransition(() =>
                            updateCell(row.id, f.key, value).then(() => {}),
                          )
                        }
                        onAssign={(ids) =>
                          startTransition(() =>
                            setAssignees(row.id, ids).then(() => {}),
                          )
                        }
                      />
                    </td>
                  ))}

                  {canEdit && (
                    <td className="px-2 py-1.5 text-center">
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

      {canEdit && (
        <div className="border-t border-border-soft p-2">
          <button
            onClick={() => startTransition(() => addRow(tabId).then(() => {}))}
            disabled={pending}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Add task
            {personField && (
              <span className="ml-auto text-xs text-faint">
                tag people after adding
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- Cell editors ---------------- */

function Cell({
  row,
  field,
  members,
  disabled,
  onSave,
  onAssign,
}: {
  row: Row;
  field: FieldCol;
  members: Member[];
  disabled: boolean;
  onSave: (value: unknown) => void;
  onAssign: (ids: string[]) => void;
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
    case "person":
      return (
        <PersonCell
          selected={row.assignees}
          members={members}
          disabled={disabled}
          onChange={onAssign}
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
  // Sync to server value when it changes (e.g. after revalidate), at render time.
  if (prev !== value) {
    setPrev(value);
    setLocal(value);
  }
  return (
    <input
      value={local}
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
  return (
    <button
      disabled={disabled}
      onClick={() => onToggle(!checked)}
      className={cn(
        "flex h-5 w-5 items-center justify-center rounded-[6px] border transition-all",
        checked
          ? "border-accent bg-accent text-accent-ink"
          : "border-border bg-surface-2 text-transparent hover:border-faint",
        disabled && "opacity-60",
      )}
      aria-pressed={checked}
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
    <div className="relative">
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none rounded-md bg-transparent px-2 py-1.5 pr-7 text-ink outline-none focus:bg-surface-2 disabled:opacity-60"
      >
        <option value="" className="bg-surface text-muted">
          —
        </option>
        {options.map((o) => (
          <option key={o} value={o} className="bg-surface text-ink">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
    </div>
  );
}

function PersonCell({
  selected,
  members,
  disabled,
  onChange,
}: {
  selected: string[];
  members: Member[];
  disabled: boolean;
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const chosen = members.filter((m) => selected.includes(m.id));

  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );
  };

  return (
    <div ref={ref} className="relative min-w-[11rem]">
      <button
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-2 disabled:opacity-60"
      >
        {chosen.length === 0 ? (
          <span className="text-faint">— unassigned</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {chosen.map((m) => (
              <span
                key={m.id}
                className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/10 py-0.5 pl-0.5 pr-2 text-xs text-accent"
              >
                <Avatar member={m} />
                {m.name.split(" ")[0]}
              </span>
            ))}
          </span>
        )}
        <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-faint" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            className="glass absolute z-20 mt-1 max-h-64 w-56 overflow-auto rounded-xl border border-border p-1.5 shadow-2xl shadow-black/50"
          >
            {members.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-faint">
                No members in this tab.
              </p>
            )}
            {members.map((m) => {
              const on = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm transition-colors hover:bg-surface-2"
                >
                  <Avatar member={m} />
                  <span className="truncate text-ink">{m.name}</span>
                  {on && <Check className="ml-auto h-4 w-4 text-accent" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Avatar({ member }: { member: Member }) {
  if (member.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={member.image}
        alt=""
        className="h-5 w-5 rounded-full border border-border object-cover"
      />
    );
  }
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[10px] font-semibold uppercase text-muted">
      {member.name.slice(0, 1)}
    </span>
  );
}
