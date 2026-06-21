import { redirect } from "next/navigation";
import { signIn, auth } from "@/auth";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const session = await auth();
  if (session?.user) {
    redirect(session.user.status === "approved" ? "/" : "/pending");
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center px-6">
      {/* oversized ghost wordmark */}
      <h1
        aria-hidden
        className="font-display pointer-events-none absolute -bottom-10 left-1/2 -translate-x-1/2 select-none text-[28vw] font-extrabold leading-none tracking-tighter text-ink/[0.025]"
      >
        synapse
      </h1>

      <div className="animate-rise relative w-full max-w-md">
        <div className="glass rounded-[--radius-xl] border border-border p-8 shadow-2xl shadow-black/40">
          <Brand size="lg" />

          {error === "AccessDenied" && (
            <p className="mt-6 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              This email isn&apos;t invited. Ask an admin to invite you first.
            </p>
          )}

          <p className="mt-8 font-display text-3xl font-bold leading-tight tracking-tight">
            See only
            <br />
            <span className="text-accent">what&apos;s yours.</span>
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Permissioned task operations. Tabs, rows and tags scoped to each
            person — by an admin, or straight from WhatsApp.
          </p>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/" });
            }}
            className="mt-8"
          >
            <Button size="lg" className="w-full" type="submit">
              <GoogleMark />
              Continue with Google
            </Button>
          </form>

          <p className="mt-5 text-center text-xs text-faint">
            Invite-only. An admin must add your email before you can sign in.
          </p>
        </div>
      </div>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="currentColor"
        d="M12 11v3.6h5.1c-.2 1.3-1.6 3.9-5.1 3.9-3.1 0-5.6-2.6-5.6-5.7S8.9 7.1 12 7.1c1.8 0 2.9.7 3.6 1.4l2.5-2.4C16.5 4.6 14.5 3.7 12 3.7 6.9 3.7 2.8 7.8 2.8 12.8S6.9 21.9 12 21.9c5.3 0 8.8-3.7 8.8-9 0-.6-.1-1-.2-1.5H12z"
      />
    </svg>
  );
}
