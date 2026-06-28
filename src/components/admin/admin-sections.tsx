"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TabsManager } from "@/components/admin/tabs-manager";
import { UsersTable } from "@/components/admin/users-table";
import { InviteForm } from "@/components/admin/invite-form";
import type { AccessBrood, UserOpt } from "@/lib/brood-access";
import {
  WhatsAppAliases,
  type AliasRow,
  type LogRow,
} from "@/components/admin/whatsapp-aliases";

type ManageBrood = {
  id: string;
  name: string;
  fields: { id: string; label: string; type: string; options: string[] }[];
};

type UserRow = {
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

const SECTIONS = [
  { key: "broods", label: "Broods" },
  { key: "people", label: "People" },
  { key: "whatsapp", label: "WhatsApp" },
] as const;

type SectionKey = (typeof SECTIONS)[number]["key"];

export function AdminSections({
  broods,
  users,
  currentUserId,
  accessBroods,
  accessUsers,
  waAliases,
  waLogs,
}: {
  broods: ManageBrood[];
  users: UserRow[];
  currentUserId: string;
  accessBroods: AccessBrood[];
  accessUsers: UserOpt[];
  waAliases: AliasRow[];
  waLogs: LogRow[];
}) {
  const [section, setSection] = React.useState<SectionKey>("broods");

  React.useEffect(() => {
    try {
      const s = localStorage.getItem("synapse-admin-section");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (s && SECTIONS.some((x) => x.key === s)) setSection(s as SectionKey);
    } catch {
      /* ignore */
    }
  }, []);
  const choose = (key: SectionKey) => {
    setSection(key);
    try {
      localStorage.setItem("synapse-admin-section", key);
    } catch {
      /* ignore */
    }
  };

  return (
    <div>
      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-border-soft bg-surface/40 p-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => choose(s.key)}
            className={cn(
              "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              section === s.key
                ? "bg-elevated text-ink shadow-[0_1px_2px_rgba(25,23,18,0.06)]"
                : "text-muted hover:text-ink",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "broods" && <TabsManager tabs={broods} />}

      {section === "people" && (
        <>
          <InviteForm />
          <UsersTable
            users={users}
            currentUserId={currentUserId}
            isAdmin
            accessBroods={accessBroods}
          />
        </>
      )}

      {section === "whatsapp" && (
        <WhatsAppAliases
          aliases={waAliases}
          broods={broods.map((b) => ({ id: b.id, name: b.name }))}
          members={accessUsers}
          logs={waLogs}
        />
      )}
    </div>
  );
}
