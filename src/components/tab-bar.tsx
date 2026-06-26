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
                className="absolute inset-0 rounded-lg border border-[#5fe04d] bg-[#75FA61] shadow-[0_1px_2px_rgba(25,23,18,0.06),0_6px_16px_-10px_rgba(58,180,45,0.45)]"
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
