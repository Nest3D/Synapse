"use client";

import * as React from "react";
import { createPortal } from "react-dom";

/**
 * Instant tooltip — shows on hover with no browser delay (unlike `title`).
 * Portalled to the body so table/overflow containers don't clip it.
 */
export function Tooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [coords, setCoords] = React.useState<{ x: number; y: number } | null>(
    null,
  );

  const show = () => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setCoords({ x: r.left + r.width / 2, y: r.top });
  };
  const hide = () => setCoords(null);

  return (
    <span
      ref={ref}
      onMouseEnter={show}
      onMouseLeave={hide}
      className="inline-flex"
    >
      {children}
      {coords &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            style={{
              position: "fixed",
              left: coords.x,
              top: coords.y - 6,
              transform: "translate(-50%, -100%)",
            }}
            className="pointer-events-none z-[200] whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-surface shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
