"use client";

import { Undo2 } from "lucide-react";
import { useUndo } from "@/components/undo-context";
import { cn } from "@/lib/utils";

export function UndoButton() {
  const { entry, undo, pending } = useUndo();
  const disabled = !entry || pending;

  return (
    <button
      onClick={() => undo()}
      disabled={disabled}
      title={
        entry ? `Undo ${entry.label} (Ctrl+Z)` : "Nothing to undo"
      }
      aria-label="Undo"
      className={cn(
        "rounded-lg p-2 transition-colors",
        disabled
          ? "text-faint/50"
          : "text-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Undo2 className="h-4 w-4" />
    </button>
  );
}
