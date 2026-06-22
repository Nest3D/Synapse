"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { inviteUser } from "@/app/(app)/admin/actions";
import { PermissionPicker, type TabOpt } from "@/components/admin/permission-picker";

export function InviteForm({ tabs }: { tabs: TabOpt[] }) {
  const [pending, start] = React.useTransition();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [tabIds, setTabIds] = React.useState<string[]>([]);
  const [fieldIds, setFieldIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

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
    <div className="mb-8 rounded-xl border border-border bg-surface card-float p-5">
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

      <div className="mt-4">
        <PermissionPicker
          tabs={tabs}
          tabIds={tabIds}
          fieldIds={fieldIds}
          onTabsChange={setTabIds}
          onFieldsChange={setFieldIds}
        />
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
