"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import { markNotificationsRead } from "@/app/(app)/actions";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  message: string;
  read: boolean;
  createdAt: string | Date;
};

function fmt(d: string | Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(d));
}

export function NotificationBell({
  items,
  unread,
}: {
  items: Item[];
  unread: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [, start] = React.useTransition();
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

  const openMenu = () => {
    setOpen(true);
    if (unread > 0) start(() => markNotificationsRead().then(() => {}));
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => (open ? setOpen(false) : openMenu())}
        className="relative rounded-lg p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-ink">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="glass card-float absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-border">
          <div className="border-b border-border-soft px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-faint">
            Notifications
          </div>
          <div className="max-h-96 overflow-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-faint">
                Nothing yet.
              </p>
            ) : (
              items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "border-b border-border-soft px-3 py-2.5 last:border-0",
                    !n.read && "bg-accent/5",
                  )}
                >
                  <p className="text-sm text-ink">{n.message}</p>
                  <p className="mt-0.5 text-[11px] text-faint">
                    {fmt(n.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
