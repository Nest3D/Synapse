"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, X, ChevronDown, Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createTab,
  renameTab,
  deleteTab,
  addField,
  deleteField,
} from "@/app/(app)/admin/actions";

type FieldType = "text" | "select" | "checkbox" | "date";
type Field = { id: string; label: string; type: string; options: string[] };
type Tab = {
  id: string;
  name: string;
  fields: Field[];
};

export function TabsManager({ tabs }: { tabs: Tab[] }) {
  const [pending, start] = React.useTransition();
  const [newName, setNewName] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(
    tabs[0]?.id ?? null,
  );

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          start(() =>
            createTab(newName.trim()).then((id) => {
              setNewName("");
              setOpenId(id);
            }),
          );
        }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New brood name (e.g. Marketing)"
          className="flex-1 rounded-lg border border-border bg-surface px-4 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-accent/50"
        />
        <Button type="submit" disabled={pending}>
          <Plus className="h-4 w-4" /> Create brood
        </Button>
      </form>

      {tabs.length === 0 && (
        <p className="rounded-xl border border-dashed border-border py-12 text-center text-sm text-faint">
          No broods yet. Create one above.
        </p>
      )}

      <div className="space-y-3">
        {tabs.map((tab) => (
          <TabCard
            key={tab.id}
            tab={tab}
            open={openId === tab.id}
            onToggle={() => setOpenId(openId === tab.id ? null : tab.id)}
            pending={pending}
            start={start}
          />
        ))}
      </div>
    </div>
  );
}

function TabCard({
  tab,
  open,
  onToggle,
  pending,
  start,
}: {
  tab: Tab;
  open: boolean;
  onToggle: () => void;
  pending: boolean;
  start: React.TransitionStartFunction;
}) {
  const [name, setName] = React.useState(tab.name);
  const [prevName, setPrevName] = React.useState(tab.name);
  if (prevName !== tab.name) {
    setPrevName(tab.name);
    setName(tab.name);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface card-float">
      <div className="flex items-center gap-3 px-4 py-3">
        <button
          onClick={onToggle}
          className="text-faint transition-transform hover:text-ink"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
          aria-label="Toggle"
        >
          <ChevronDown className="h-4 w-4" />
        </button>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() =>
            name.trim() &&
            name !== tab.name &&
            start(() => renameTab(tab.id, name).then(() => {}))
          }
          className="flex-1 rounded-md bg-transparent px-1 py-1 font-display text-lg font-bold tracking-tight text-ink outline-none focus:bg-surface-2"
        />

        <button
          onClick={() => {
            if (confirm(`Delete "${tab.name}" and all its tasks?`))
              start(() => deleteTab(tab.id).then(() => {}));
          }}
          className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
          aria-label="Delete brood"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border-soft"
          >
            <div className="p-5">
              <FieldsSection tab={tab} pending={pending} start={start} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldsSection({
  tab,
  pending,
  start,
}: {
  tab: Tab;
  pending: boolean;
  start: React.TransitionStartFunction;
}) {
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<FieldType>("text");
  const [optionsText, setOptionsText] = React.useState("");

  return (
    <div>
      <h3 className="mb-3 flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-faint">
        <Columns3 className="h-3.5 w-3.5" /> Columns
      </h3>

      <div className="space-y-1.5">
        {tab.fields.map((f) => (
          <div
            key={f.id}
            className="flex items-center gap-2 rounded-lg border border-border-soft bg-surface px-3 py-2 text-sm"
          >
            <span className="text-ink">{f.label}</span>
            <span className="rounded-full border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase text-faint">
              {f.type}
            </span>
            <button
              onClick={() => start(() => deleteField(f.id).then(() => {}))}
              className="ml-auto text-faint transition-colors hover:text-danger"
              aria-label="Delete column"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!label.trim()) return;
          const opts =
            type === "select"
              ? optionsText
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : [];
          start(() =>
            addField(tab.id, label.trim(), type, opts).then(() => {
              setLabel("");
              setOptionsText("");
              setType("text");
            }),
          );
        }}
        className="mt-3 space-y-2 rounded-lg border border-dashed border-border p-3"
      >
        <div className="flex gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="New column label"
            className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent/50"
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            className="rounded-md border border-border bg-surface px-2 py-1.5 text-sm outline-none"
          >
            <option value="text">text</option>
            <option value="select">select</option>
            <option value="checkbox">checkbox</option>
            <option value="date">date</option>
          </select>
        </div>
        {type === "select" && (
          <input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder="Options, comma separated (e.g. Low, Medium, High)"
            className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm outline-none focus:border-accent/50"
          />
        )}
        <Button type="submit" size="sm" variant="secondary" disabled={pending}>
          <Plus className="h-3.5 w-3.5" /> Add column
        </Button>
      </form>
    </div>
  );
}
