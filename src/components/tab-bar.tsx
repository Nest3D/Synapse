"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export type TabItem = { href: string; label: string };

export function TabBar({
  items,
  trailing,
}: {
  items: TabItem[];
  trailing?: React.ReactNode;
}) {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border-soft bg-surface/40 p-1.5">
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
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
              {item.label}
            </span>
          </Link>
        );
      })}
      {trailing}
    </div>
  );
}
