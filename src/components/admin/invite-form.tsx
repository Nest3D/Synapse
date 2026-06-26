"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { inviteUser } from "@/app/(app)/admin/actions";

export function InviteForm() {
  const [pending, start] = React.useTransition();
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"admin" | "member">("member");
  const [error, setError] = React.useState<string | null>(null);

  const submit = () => {
    setError(null);
    start(async () => {
      const res = await inviteUser(email, role);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setEmail("");
    });
  };

  return (
    <div className="mb-8 rounded-xl border border-border bg-surface card-float p-5">
      <h2 className="font-display text-lg font-semibold">Invite someone</h2>
      <p className="mt-1 text-sm text-muted">
        Only invited emails can sign in. Grant them access to broods and columns
        below.
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
        <Select
          ariaLabel="Role"
          value={role}
          onChange={(v) => setRole(v as "admin" | "member")}
          className="w-32"
          options={[
            { value: "member", label: "member" },
            { value: "admin", label: "admin" },
          ]}
        />
        <Button disabled={pending || !email} onClick={submit}>
          Send invite
        </Button>
      </div>

      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </div>
  );
}
