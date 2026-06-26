"use client";

import * as React from "react";

export type UndoEntry = { label: string; run: () => Promise<unknown> };

type UndoCtx = {
  entry: UndoEntry | null;
  pending: boolean;
  push: (entry: UndoEntry) => void;
  undo: () => void;
};

const Ctx = React.createContext<UndoCtx>({
  entry: null,
  pending: false,
  push: () => {},
  undo: () => {},
});

export const useUndo = () => React.useContext(Ctx);

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  );
}

/** Single-level undo: holds the most recent reversible action. */
export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [entry, setEntry] = React.useState<UndoEntry | null>(null);
  const [pending, start] = React.useTransition();

  const push = React.useCallback((e: UndoEntry) => setEntry(e), []);

  const undo = React.useCallback(() => {
    setEntry((current) => {
      if (current) start(() => current.run().then(() => {}).catch(() => {}));
      return null;
    });
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (
        (e.ctrlKey || e.metaKey) &&
        !e.shiftKey &&
        e.key.toLowerCase() === "z"
      ) {
        // Let the browser handle text undo inside editable fields.
        if (isEditable(e.target)) return;
        if (!entry) return;
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entry, undo]);

  return (
    <Ctx.Provider value={{ entry, pending, push, undo }}>
      {children}
    </Ctx.Provider>
  );
}
