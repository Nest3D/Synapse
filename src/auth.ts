import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import type { Role, UserStatus } from "@prisma/client";
import { isLoginAllowed } from "@/lib/permissions";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({ allowDangerousEmailAccountLinking: true }),
  ],
  session: { strategy: "jwt" },
  trustHost: true,
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      const email = user.email?.toLowerCase();
      if (!email) return false;
      if (email === ADMIN_EMAIL) return true;
      const existing = await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });
      return isLoginAllowed({ email, adminEmail: ADMIN_EMAIL, userExists: !!existing });
    },
    // Pull role + status into the JWT on each request so admin approval /
    // role changes / removal take effect without re-login.
    async jwt({ token }) {
      if (!token.sub) return token;
      const dbUser = await prisma.user.findUnique({
        where: { id: token.sub },
        select: { role: true, status: true },
      });
      if (dbUser) {
        token.role = dbUser.role;
        token.status = dbUser.status;
      } else {
        // User was removed by admin — invalidate.
        token.role = undefined;
        token.status = undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = token.role as Role | undefined;
        session.user.status = token.status as UserStatus | undefined;
      }
      return session;
    },
  },
  events: {
    // Auto-promote the configured admin email on first account creation.
    async createUser({ user }) {
      if (user.email && user.email.toLowerCase() === ADMIN_EMAIL) {
        await prisma.user.update({
          where: { id: user.id },
          data: { role: "admin", status: "approved" },
        });
      }
    },
  },
});
