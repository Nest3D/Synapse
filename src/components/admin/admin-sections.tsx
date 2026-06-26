"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TabsManager } from "@/components/admin/tabs-manager";
import { UsersTable } from "@/components/admin/users-table";
import { InviteForm } from "@/components/admin/invite-form";
import {
  BroodAccessPanel,
  type Brood,
  type UserOpt,
} from "@/components/admin/brood-access-panel";
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
  { key: "access", label: "Access" },
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
  accessBroods: Brood[];
  accessUsers: UserOpt[];
  waAliases: AliasRow[];
  waLogs: LogRow[];
}) {
  const [section, setSection] = React.useState<SectionKey>("broods");

  return (
    <div>
      <div className="mb-6 flex w-fit gap-1 rounded-xl border border-border-soft bg-surface/40 p-1.5">
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
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
          <UsersTable users={users} currentUserId={currentUserId} isAdmin />
        </>
      )}

      {section === "access" && (
        <BroodAccessPanel broods={accessBroods} users={accessUsers} />
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
