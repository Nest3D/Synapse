"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pencil, Phone, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import {
  memberSeesColumn,
  applyMemberColumnAccess,
  type AccessBrood,
} from "@/lib/brood-access";
import {
  approveUser,
  removeUser,
  setRole,
  setBroodMembership,
  setColumnMode,
  setMemberColumnAccess,
} from "@/app/(app)/admin/actions";
import { setNickname, setPhone } from "@/app/(app)/people/actions";
import { cn } from "@/lib/utils";
import type { FieldAccessMode } from "@prisma/client";

type U = {
  id: string;
  name: string | null;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  image: string | null;
  role: "admin" | "member";
  status: "pending" | "approved";
  joined: boolean;
};

type Mode = FieldAccessMode;
const MODE_LABEL: Record<Mode, string> = {
  ALL: "Brood Member",
  INCLUDE: "Only these",
  EXCLUDE: "Everyone except",
};

export function UsersTable({
  users,
  currentUserId,
  isAdmin,
  accessBroods,
}: {
  users: U[];
  currentUserId: string;
  isAdmin: boolean;
  accessBroods: AccessBrood[];
}) {
  const [pending, start] = React.useTransition();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const colSpan = isAdmin ? 4 : 3;

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface card-float">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface-2/60 text-left font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
            <th className="px-4 py-3">User</th>
            <th className="px-4 py-3">Role</th>
            <th className="px-4 py-3">Status</th>
            {isAdmin && <th className="px-4 py-3 text-right">Actions</th>}
          </tr>
        </thead>
        <tbody>
          <AnimatePresence initial={false}>
            {users.map((u) => {
              const self = u.id === currentUserId;
              const expanded = openId === u.id;
              return (
                <React.Fragment key={u.id}>
                <motion.tr
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="border-b border-border-soft last:border-0 hover:bg-surface-2/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setOpenId(expanded ? null : u.id)}
                        aria-label={
                          expanded ? "Collapse access" : "Expand access"
                        }
                        className="shrink-0 text-faint transition-colors hover:text-ink"
                      >
                        <ChevronDown
                          className="h-4 w-4 transition-transform"
                          style={{
                            transform: expanded
                              ? "rotate(0deg)"
                              : "rotate(-90deg)",
                          }}
                        />
                      </button>
                      {u.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.image}
                          alt=""
                          className="h-8 w-8 rounded-full border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold uppercase">
                          {(u.nickname ?? u.name ?? u.email ?? "?").slice(0, 1)}
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
                        <div className="flex flex-wrap items-center gap-x-3">
                          {(isAdmin || self) && (
                            <NicknameEditor
                              userId={u.id}
                              initial={u.nickname}
                            />
                          )}
                          {isAdmin && (
                            <PhoneEditor userId={u.id} initial={u.phone} />
                          )}
                        </div>
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
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-xs",
                        u.status === "approved" ? "text-ink" : "text-warn",
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
                {expanded && (
                  <tr className="border-b border-border-soft last:border-0 bg-surface-2/20">
                    <td colSpan={colSpan} className="px-4 py-3">
                      <MemberAccess userId={u.id} broods={accessBroods} />
                    </td>
                  </tr>
                )}
                </React.Fragment>
              );
            })}
          </AnimatePresence>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Per-member access editor: level 1 is brood membership (the gate), level 2 is
 * each column's mode (brood-wide) + whether THIS member sees it. Optimistic:
 * edits update a local mirror immediately and fire a server action; the mirror
 * re-seeds when revalidated props arrive.
 */
function MemberAccess({
  userId,
  broods,
}: {
  userId: string;
  broods: AccessBrood[];
}) {
  const [model, setModel] = React.useState(broods);
  const sig = JSON.stringify(broods);
  const [prevSig, setPrevSig] = React.useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    setModel(broods);
  }
  const [, start] = React.useTransition();

  const setMember = (tabId: string, isMember: boolean) => {
    setModel((m) =>
      m.map((b) =>
        b.id !== tabId
          ? b
          : {
              ...b,
              members: isMember
                ? [...b.members.filter((id) => id !== userId), userId]
                : b.members.filter((id) => id !== userId),
            },
      ),
    );
    start(() => setBroodMembership(tabId, userId, isMember).then(() => {}));
  };

  const setMode = (tabId: string, fieldId: string, mode: Mode) => {
    setModel((m) =>
      m.map((b) =>
        b.id !== tabId
          ? b
          : {
              ...b,
              fields: b.fields.map((f) =>
                f.id !== fieldId
                  ? f
                  : {
                      ...f,
                      accessMode: mode,
                      userIds: mode === "ALL" ? [] : f.userIds,
                    },
              ),
            },
      ),
    );
    start(() => setColumnMode(fieldId, mode).then(() => {}));
  };

  const setSees = (tabId: string, fieldId: string, canView: boolean) => {
    setModel((m) =>
      m.map((b) =>
        b.id !== tabId
          ? b
          : {
              ...b,
              fields: b.fields.map((f) => {
                if (f.id !== fieldId) return f;
                const { mode: accessMode, userIds } = applyMemberColumnAccess(
                  f.accessMode,
                  f.userIds,
                  userId,
                  canView,
                );
                return { ...f, accessMode, userIds };
              }),
            },
      ),
    );
    start(() => setMemberColumnAccess(fieldId, userId, canView).then(() => {}));
  };

  if (model.length === 0)
    return <p className="text-xs text-faint">No shared broods.</p>;

  return (
    <div className="space-y-3">
      {model.map((b) => {
        const isMember = b.members.includes(userId);
        return (
          <div
            key={b.id}
            className="rounded-lg border border-border-soft bg-surface p-3"
          >
            <label className="flex items-center gap-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={isMember}
                onChange={(e) => setMember(b.id, e.target.checked)}
                className="h-4 w-4 accent-accent"
              />
              {b.name}
              {!isMember && (
                <span className="text-xs font-normal text-faint">
                  not a member
                </span>
              )}
            </label>

            {isMember && b.fields.length > 0 && (
              <div className="mt-3 space-y-2">
                {b.fields.map((f) => {
                  const sees = memberSeesColumn(f.accessMode, f.userIds, userId);
                  return (
                    <div
                      key={f.id}
                      className="flex flex-wrap items-center gap-3"
                    >
                      <span className="min-w-[7rem] flex-1 text-sm text-ink">
                        {f.label}
                      </span>
                      <div className="flex flex-col items-start gap-0.5">
                        <Select
                          value={f.accessMode}
                          onChange={(v) => setMode(b.id, f.id, v as Mode)}
                          ariaLabel="Column visibility mode (applies brood-wide)"
                          className="w-40"
                          options={(["ALL", "INCLUDE", "EXCLUDE"] as const).map(
                            (mm) => ({ value: mm, label: MODE_LABEL[mm] }),
                          )}
                        />
                        <span className="text-[10px] uppercase tracking-wide text-faint">
                          all members
                        </span>
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                        <input
                          type="checkbox"
                          checked={sees}
                          onChange={(e) => setSees(b.id, f.id, e.target.checked)}
                          className="h-4 w-4 accent-accent"
                        />
                        sees
                      </label>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
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

/** Admin-only inline WhatsApp phone editor. */
function PhoneEditor({
  userId,
  initial,
}: {
  userId: string;
  initial: string | null;
}) {
  const [editing, setEditing] = React.useState(false);
  const [val, setVal] = React.useState(initial ?? "");
  const [pending, start] = React.useTransition();

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
        <Phone className="h-3 w-3" />
        {initial ? initial : "add phone"}
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
          start(() => setPhone(userId, val).then(() => {}));
      }}
      placeholder="WhatsApp number"
      className="mt-1 w-36 rounded-md border border-border bg-surface-2 px-2 py-1 text-xs text-ink outline-none focus:border-accent"
    />
  );
}
