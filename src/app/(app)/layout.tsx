import { redirect } from "next/navigation";
import Link from "next/link";
import {
  getCurrentUser,
  getNavForUser,
  getNotifications,
  isAdmin,
} from "@/lib/access";
import { signOut } from "@/auth";
import { Brand } from "@/components/brand";
import { NavLink } from "@/components/nav-link";
import { NotificationBell } from "@/components/notification-bell";
import { UndoProvider } from "@/components/undo-context";
import { UndoButton } from "@/components/undo-button";
import { TabBar } from "@/components/tab-bar";

// Every app route depends on the signed-in user + DB; never prerender.
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status !== "approved") redirect("/pending");

  const admin = isAdmin(user);
  const [{ nickname, tabs }, notif] = await Promise.all([
    getNavForUser(user),
    getNotifications(user),
  ]);
  const displayName = nickname ?? user.name ?? user.email;

  return (
    <UndoProvider>
    <div className="flex min-h-screen flex-col">
      <header className="glass sticky top-0 z-30 border-b border-border-soft">
        <div className="mx-auto flex h-16 w-full max-w-[1400px] items-center gap-6 px-6">
          <Link href="/" className="shrink-0">
            <Brand size="md" />
          </Link>

          <nav className="ml-2 flex flex-wrap items-center gap-1 text-sm">
            <NavLink href="/">All Tasks</NavLink>
            <NavLink href="/my-tasks">My Tasks</NavLink>
            <NavLink href="/archive">Archive</NavLink>
            {admin && <NavLink href="/people">People</NavLink>}
            {admin && <NavLink href="/admin/tabs">Brood</NavLink>}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <UndoButton />
            <NotificationBell
              items={notif.items.map((n) => ({
                id: n.id,
                message: n.message,
                read: n.read,
                createdAt: n.createdAt,
              }))}
              unread={notif.unread}
            />
            {admin && (
              <span className="hidden rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-widest text-accent sm:block">
                Admin
              </span>
            )}
            <div className="flex items-center gap-2.5">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt=""
                  className="h-8 w-8 rounded-full border border-border object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-semibold uppercase">
                  {(displayName ?? "?").slice(0, 1)}
                </div>
              )}
              <span className="hidden max-w-[140px] truncate text-sm text-muted md:block">
                {displayName}
              </span>
            </div>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button
                type="submit"
                className="rounded-lg px-2 py-1.5 text-xs text-faint transition-colors hover:text-danger"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {tabs.length > 0 && (
        <div className="mx-auto w-full max-w-[1400px] px-6 pt-6">
          <TabBar tabs={tabs.map((t) => ({ id: t.id, name: t.name }))} />
        </div>
      )}

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-6 py-8">
        {children}
      </main>
    </div>
    </UndoProvider>
  );
}
