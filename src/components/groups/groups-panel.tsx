"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users, Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupMembers,
} from "@/app/(app)/groups/actions";

export type UserOpt = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type GroupView = {
  id: string;
  name: string;
  createdById: string;
  creatorLabel: string;
  memberIds: string[];
};

const label = (u: UserOpt) => u.name ?? u.email ?? "Unknown";

/** Create groups (any member) and manage the ones you own (or any, if admin). */
export function GroupsPanel({
  users,
  groups,
  currentUserId,
  isAdmin,
}: {
  users: UserOpt[];
  groups: GroupView[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [pending, start] = React.useTransition();
  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState("");
  const [memberIds, setMemberIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<GroupView | null>(null);

  const resetCreate = () => {
    setName("");
    setMemberIds([]);
    setError(null);
    setCreating(false);
  };

  const submitCreate = () => {
    setError(null);
    start(async () => {
      const res = await createGroup(name, memberIds);
      if (res?.error) {
        setError(res.error);
        return;
      }
      resetCreate();
    });
  };

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold tracking-tight">
            Groups
          </h2>
          <p className="mt-1 text-sm text-muted">
            Tag a whole team at once. Anyone can create a group; the creator and
            admins can edit it.
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Create group
          </Button>
        )}
      </div>

      {creating && (
        <div className="mb-6 rounded-xl border border-border bg-surface card-float p-5">
          <input
            autoFocus
            aria-label="Group name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Group name (e.g. Design team)"
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <p className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
            Members
          </p>
          <MemberPicker
            users={users}
            selected={memberIds}
            onChange={setMemberIds}
          />
          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={pending} onClick={resetCreate}>
              Cancel
            </Button>
            <Button size="sm" disabled={pending || !name.trim()} onClick={submitCreate}>
              Create group
            </Button>
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-6 py-12 text-center text-sm text-faint card-float">
          No groups yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {groups.map((g) => {
            const canEdit = isAdmin || g.createdById === currentUserId;
            return (
              <div
                key={g.id}
                className="rounded-xl border border-border bg-surface card-float p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/30 bg-accent/10 text-accent">
                        <Users className="h-3.5 w-3.5" />
                      </span>
                      <h3 className="truncate font-medium text-ink">{g.name}</h3>
                    </div>
                    <p className="mt-1.5 text-xs text-faint">
                      {g.memberIds.length}{" "}
                      {g.memberIds.length === 1 ? "member" : "members"} · by{" "}
                      {g.creatorLabel}
                    </p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        onClick={() => setEditing(g)}
                        className="rounded-md p-1.5 text-faint transition-colors hover:bg-surface-2 hover:text-ink"
                        aria-label="Edit group"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `Delete group "${g.name}"? Tasks tagged with it lose that tag.`,
                            )
                          )
                            start(() => deleteGroup(g.id).then(() => {}));
                        }}
                        className="rounded-md p-1.5 text-faint transition-colors hover:bg-danger/10 hover:text-danger"
                        aria-label="Delete group"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {g.memberIds.slice(0, 8).map((id) => {
                    const u = users.find((x) => x.id === id);
                    if (!u) return null;
                    return (
                      <span
                        key={id}
                        className="inline-flex items-center rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted"
                      >
                        {label(u).split(" ")[0]}
                      </span>
                    );
                  })}
                  {g.memberIds.length > 8 && (
                    <span className="text-[11px] text-faint">
                      +{g.memberIds.length - 8}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <EditGroupModal
        group={editing}
        users={users}
        onClose={() => setEditing(null)}
      />
    </section>
  );
}

function EditGroupModal({
  group,
  users,
  onClose,
}: {
  group: GroupView | null;
  users: UserOpt[];
  onClose: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [memberIds, setMemberIds] = React.useState<string[]>([]);

  // Re-seed from the latest server state whenever a different group opens.
  const openedId = group?.id ?? null;
  const [seededId, setSeededId] = React.useState<string | null>(null);
  if (openedId !== seededId) {
    setSeededId(openedId);
    setName(group?.name ?? "");
    setMemberIds(group?.memberIds ?? []);
  }

  const save = () => {
    if (!group) return;
    start(async () => {
      if (name.trim() && name.trim() !== group.name) {
        await renameGroup(group.id, name);
      }
      await setGroupMembers(group.id, memberIds);
      onClose();
    });
  };

  return (
    <AnimatePresence>
      {group && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => !pending && onClose()}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.15 }}
            onClick={(e) => e.stopPropagation()}
            className="glass card-float w-full max-w-lg rounded-xl border border-border p-6"
          >
            <h2 className="font-display text-lg font-semibold">Edit group</h2>
            <input
              aria-label="Group name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-4 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
            />
            <p className="mb-2 mt-4 font-mono text-[11px] uppercase tracking-[0.15em] text-faint">
              Members
            </p>
            <div className="max-h-[45vh] overflow-y-auto pr-1">
              <MemberPicker
                users={users}
                selected={memberIds}
                onChange={setMemberIds}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <Button size="sm" disabled={pending || !name.trim()} onClick={save}>
                Save
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MemberPicker({
  users,
  selected,
  onChange,
}: {
  users: UserOpt[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) =>
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id],
    );

  return (
    <div className="flex flex-wrap gap-2">
      {users.map((u) => {
        const on = selected.includes(u.id);
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => toggle(u.id)}
            className={
              "rounded-full border px-3 py-1.5 text-xs transition-colors " +
              (on
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border text-muted hover:text-ink")
            }
          >
            {label(u)}
          </button>
        );
      })}
    </div>
  );
}
