"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { inviteUser } from "@/app/(app)/admin/actions";

type FieldOpt = { id: string; key: string; label: string };
type TabOpt = { id: string; name: string; fields: FieldOpt[] };

export function InviteForm({ tabs }: { tabs: TabOpt[] }) {
  const [pending, start] = React.useTransition();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [tabIds, setTabIds] = React.useState<string[]>([]);
  const [fieldIds, setFieldIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  const toggle = (
    id: string,
    list: string[],
    set: (v: string[]) => void,
  ) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const toggleTab = (tab: TabOpt) => {
    if (tabIds.includes(tab.id)) {
      setTabIds(tabIds.filter((x) => x !== tab.id));
      const owned = new Set(tab.fields.map((f) => f.id));
      setFieldIds(fieldIds.filter((id) => !owned.has(id)));
    } else {
      setTabIds([...tabIds, tab.id]);
    }
  };

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await inviteUser(email, role, tabIds, fieldIds);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEmail("");
      setTabIds([]);
      setFieldIds([]);
    });
  };

  return (
    <div className="mb-8 rounded-xl border border-border bg-surface/30 p-5">
      <h2 className="font-display text-lg font-semibold">Invite someone</h2>
      <p className="mt-1 text-sm text-muted">
        Only invited emails can sign in. Leave a tab&apos;s fields unchecked to
        grant all columns.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <input
          type="email"
          aria-label="Invite email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="person@example.com"
          className="min-w-[16rem] flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink outline-none focus:border-accent"
        />
        <select
          aria-label="Role"
          value={role}
          onChange={(e) => setRole(e.target.value as "admin" | "member")}
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-sm text-ink"
        >
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
      </div>

      <div className="mt-4 space-y-3">
        {tabs.map((tab) => {
          const on = tabIds.includes(tab.id);
          return (
            <div key={tab.id} className="rounded-lg border border-border-soft p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggleTab(tab)}
                />
                {tab.name}
              </label>
              {on && (
                <div className="mt-2 flex flex-wrap gap-3 pl-6">
                  {tab.fields.map((f) => (
                    <label
                      key={f.id}
                      className="flex items-center gap-1.5 text-xs text-muted"
                    >
                      <input
                        type="checkbox"
                        checked={fieldIds.includes(f.id)}
                        onChange={() => toggle(f.id, fieldIds, setFieldIds)}
                      />
                      {f.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}

      <div className="mt-4">
        <Button disabled={pending || !email} onClick={submit}>
          Send invite
        </Button>
      </div>
    </div>
  );
}
