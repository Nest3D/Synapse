"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type SelectOption = { value: string; label: string };

/**
 * Styled single-select dropdown — a button trigger plus a portalled, animated
 * glass panel (so the open list matches the app instead of the OS menu).
 * Flips upward near the viewport bottom; closes on outside-click / Escape.
 */
export function Select({
  value,
  options,
  onChange,
  disabled = false,
  placeholder = "—",
  variant = "field",
  ariaLabel,
  align = "left",
  className,
  iconTrigger,
  hoverLabel,
}: {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  variant?: "field" | "cell";
  ariaLabel?: string;
  align?: "left" | "right";
  className?: string;
  /** Render an icon-only trigger that reveals `hoverLabel` on hover. */
  iconTrigger?: React.ReactNode;
  hoverLabel?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIdx, setActiveIdx] = React.useState(0);
  const [coords, setCoords] = React.useState<{
    top: number;
    left: number;
    minWidth: number;
    openUp: boolean;
  } | null>(null);
  const btnRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  const place = React.useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estHeight = Math.min(280, 16 + options.length * 38);
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < estHeight && r.top > spaceBelow;
    setCoords({
      top: openUp ? r.top - 6 : r.bottom + 6,
      left: align === "right" ? r.right : r.left,
      minWidth: r.width,
      openUp,
    });
  }, [options.length, align]);

  const openMenu = () => {
    setActiveIdx(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

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
  }, [open, place, options, value]);

  const choose = (v: string) => {
    onChange(v);
    setOpen(false);
    btnRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const opt = options[activeIdx];
      if (opt) choose(opt.value);
    }
  };

  return (
    <div className={cn("relative", className)}>
      {iconTrigger ? (
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          className="group/ho flex items-center gap-1 rounded-md px-1.5 py-1.5 text-faint outline-none transition-colors hover:bg-surface-2 hover:text-ink focus-visible:bg-surface-2 disabled:opacity-60"
        >
          {iconTrigger}
          {hoverLabel && (
            <span className="max-w-0 overflow-hidden whitespace-nowrap text-xs font-medium transition-all duration-200 group-hover/ho:max-w-[5rem]">
              {hoverLabel}
            </span>
          )}
        </button>
      ) : (
        <button
          ref={btnRef}
          type="button"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => (open ? setOpen(false) : openMenu())}
          onKeyDown={onKeyDown}
          className={cn(
            "flex w-full items-center gap-2 outline-none transition-colors disabled:opacity-60",
            variant === "field"
              ? "rounded-md border border-border bg-surface-2 px-2.5 py-1.5 text-sm text-ink hover:border-faint focus-visible:border-accent"
              : "rounded-md bg-transparent px-2 py-1.5 text-sm text-ink hover:bg-surface-2 focus-visible:bg-surface-2",
          )}
        >
          <span className={cn("truncate", !selected && "text-faint")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 text-faint transition-transform duration-150",
              open && "rotate-180",
            )}
          />
        </button>
      )}

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && coords && (
              <motion.div
                ref={panelRef}
                role="listbox"
                initial={{ opacity: 0, y: coords.openUp ? 4 : -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: coords.openUp ? 4 : -4, scale: 0.97 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: "fixed",
                  top: coords.openUp ? undefined : coords.top,
                  bottom: coords.openUp
                    ? window.innerHeight - coords.top
                    : undefined,
                  left: align === "left" ? coords.left : undefined,
                  right:
                    align === "right"
                      ? window.innerWidth - coords.left
                      : undefined,
                  minWidth: coords.minWidth,
                  transformOrigin: coords.openUp ? "bottom" : "top",
                }}
                className="glass card-float z-[120] max-h-72 min-w-[9rem] overflow-auto rounded-xl border border-border p-1.5 shadow-xl"
              >
                {options.map((o, i) => {
                  const on = o.value === value;
                  const active = i === activeIdx;
                  return (
                    <button
                      key={o.value}
                      type="button"
                      role="option"
                      aria-selected={on}
                      onMouseEnter={() => setActiveIdx(i)}
                      onClick={() => choose(o.value)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors",
                        active ? "bg-surface-2 text-ink" : "text-muted",
                        on && "text-accent",
                      )}
                    >
                      <span className="truncate">{o.label}</span>
                      {on && <Check className="ml-auto h-4 w-4 text-accent" />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
