"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { approveUser, removeUser, setRole } from "@/app/(app)/admin/actions";
import { cn } from "@/lib/utils";

type U = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: "admin" | "member";
  status: "pending" | "approved";
  joined: boolean;
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: U[];
  currentUserId: string;
}) {
  const [pending, start] = React.useTransition();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface/30">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/60 text-left font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {users.map((u) => {
              const self = u.id === currentUserId;
              return (
                <motion.tr
                  key={u.id}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.image}
                          alt=""
                          className="h-8 w-8 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold uppercase">
                          {(u.name ?? u.email ?? "?").slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">
                          {u.name ?? "—"} {self && <span className="text-faint">(you)</span>}
                        </div>
                        <div className="truncate font-mono text-xs text-faint">
                          {u.email}
                        </div>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <button
                      disabled={pending || self}
                      onClick={() =>
                        start(() =>
                          setRole(
                            u.id,
                            u.role === "admin" ? "member" : "admin",
                          ).then(() => {}),
                        )
                      }
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50",
                        u.role === "admin"
                          ? "border-accent/30 bg-accent/10 text-accent"
                          : "border-border text-muted hover:text-ink",
                      )}
                      title={self ? "" : "Click to toggle role"}
                    >
                      {u.role}
                    </button>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs",
                        u.status === "approved"
                          ? "text-ink"
                          : "text-warn",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          u.status === "approved"
                            ? "bg-accent"
                            : "animate-pulse bg-warn",
                        )}
                      />
                      {u.status === "pending" && !u.joined ? "invited" : u.status}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {u.status === "pending" && (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() =>
                            start(() => approveUser(u.id).then(() => {}))
                          }
                        >
                          Approve
                        </Button>
                      )}
                      {!self && (
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={pending}
                          onClick={() => {
                            if (
                              confirm(
                                `Remove ${u.email}? They lose all access immediately.`,
                              )
                            )
                              start(() => removeUser(u.id).then(() => {}));
                          }}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}
