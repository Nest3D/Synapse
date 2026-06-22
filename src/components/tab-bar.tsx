"use client";

import Link from "next/link";
import { motion } from "framer-motion";

export function TabBar({
  tabs,
  activeId,
}: {
  tabs: { id: string; name: string }[];
  activeId: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border-soft bg-surface/40 p-1.5">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <Link
            key={tab.id}
            href={`/tab/${tab.id}`}
            className="relative rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            {active && (
              <motion.span
                layoutId="tab-pill"
                className="absolute inset-0 rounded-lg bg-elevated shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset,0_8px_20px_-12px_rgba(0,0,0,0.6)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span
              className={`relative z-10 ${
                active ? "text-ink" : "text-muted hover:text-ink"
              }`}
            >
              {tab.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
