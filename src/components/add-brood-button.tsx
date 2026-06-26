"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createTab } from "@/app/(app)/admin/actions";

export function AddBroodButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [pending, start] = React.useTransition();
  const router = useRouter();
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const submit = () => {
    if (!name.trim()) return;
    start(async () => {
      const id = await createTab(name);
      setOpen(false);
      setName("");
      if (id) router.push(`/tab/${id}`);
    });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Add brood"
        title={isAdmin ? "Add a brood" : "Add a private brood"}
      >
        <Plus className="h-4 w-4" />
      </button>

      {open && (
        <div className="glass card-float absolute left-0 top-full z-50 mt-2 w-64 rounded-xl border border-border p-3">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setOpen(false);
            }}
            placeholder="Brood name"
            className="w-full rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent"
          />
          {!isAdmin && (
            <p className="mt-2 text-[11px] text-faint">
              Private brood — only you can see it.
            </p>
          )}
          <div className="mt-2 flex justify-end">
            <button
              onClick={submit}
              disabled={pending || !name.trim()}
              className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink transition-opacity disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
