"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { approveUser, removeUser, setRole } from "@/app/(app)/admin/actions";
import { setNickname } from "@/app/(app)/people/actions";
import { EditAccess } from "@/components/admin/edit-access";
import type { TabOpt } from "@/components/admin/permission-picker";
import { cn } from "@/lib/utils";

type U = {
  id: string;
  name: string | null;
  nickname: string | null;
  email: string | null;
  image: string | null;
  role: "admin" | "member";
  status: "pending" | "approved";
  joined: boolean;
  tabIds: string[];
  fieldIds: string[];
};

export function UsersTable({
  users,
  currentUserId,
  tabs,
  isAdmin,
  groupsByUser,
}: {
  users: U[];
  currentUserId: string;
  tabs: TabOpt[];
  isAdmin: boolean;
  groupsByUser: Record<string, { id: string; name: string }[]>;
}) {
  const [pending, start] = React.useTransition();

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface card-float">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/60 text-left font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Groups</th>
            <th className="px-4 py-3">Status</th>
            {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
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
                          {u.nickname ?? u.name ?? "—"}{" "}
                          {self && <span className="text-faint">(you)</span>}
                        </div>
                        {u.nickname && u.name && (
                          <div className="truncate text-xs text-muted">
                            {u.name}
                          </div>
                        )}
                        <div className="truncate font-mono text-xs text-faint">
                          {u.email}
                        </div>
                        {(isAdmin || self) && (
                          <NicknameEditor userId={u.id} initial={u.nickname} />
                        )}
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    {isAdmin ? (
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
                    ) : (
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-1 text-xs font-medium",
                          u.role === "admin"
                            ? "border-accent/30 bg-accent/10 text-accent"
                            : "border-border text-muted",
                        )}
                      >
                        {u.role}
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(groupsByUser[u.id] ?? []).length === 0 ? (
                        <span className="text-xs text-faint">—</span>
                      ) : (
                        (groupsByUser[u.id] ?? []).map((g) => (
                          <span
                            key={g.id}
                            className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted"
                          >
                            {g.name}
                          </span>
                        ))
                      )}
                    </div>
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

                  {isAdmin && (
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {u.role === "member" && (
                        <EditAccess
                          userId={u.id}
                          userLabel={u.name ?? u.email ?? "this user"}
                          tabs={tabs}
                          initialTabIds={u.tabIds}
                          initialFieldIds={u.fieldIds}
                        />
                      )}
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
                  )}
                </motion.tr>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

/** Inline nickname editor: a pencil toggle that becomes a save-on-blur input. */
function NicknameEditor({
  userId,
  initial,
}: {
  userId: string;
  initial: string | null;
}) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(initial ?? "");
  const [pending, start] = React.useTransition();

  // Reconcile with the server value after a save revalidates.
  const [prev, setPrev] = React.useState(initial ?? "");
  if ((initial ?? "") !== prev) {
    setPrev(initial ?? "");
    setVal(initial ?? "");
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="mt-1 inline-flex items-center gap-1 text-[11px] text-faint transition-colors hover:text-ink"
      >
        <Pencil className="h-3 w-3" />
        {initial ? "edit nickname" : "add nickname"}
      </button>
    );
  }

  return (
    <input
      autoFocus
      value={val}
      disabled={pending}
      onChange={(e) => setVal(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setVal(initial ?? "");
          setEditing(false);
        }
      }}
      onBlur={() => {
        setEditing(false);
        if (val.trim() !== (initial ?? ""))
          start(() => setNickname(userId, val).then(() => {}));
      }}
      placeholder="nickname"
      className="mt-1 w-32 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-accent"
    />
  );
}
