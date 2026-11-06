import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "@/lib/db";

export const devLoginEnabled = process.env.DEV_LOGIN === "1" && process.env.NODE_ENV !== "production";

const providers: Provider[] = [];
if (process.env.AUTH_GOOGLE_ID) {
  // Users are created by the admin first; Google sign-in links to that user by email.
  providers.push(Google({ allowDangerousEmailAccountLinking: true }));
}
if (process.env.AUTH_RESEND_KEY) {
  providers.push(Resend({ from: process.env.AUTH_EMAIL_FROM }));
}
if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev",
      name: "Dev login",
      credentials: { email: { label: "Email" } },
      async authorize(c) {
        const email = String(c?.email ?? "").toLowerCase().trim();
        const user = await db.user.findUnique({ where: { email } });
        return user && user.active ? { id: user.id, email: user.email, name: user.name } : null;
      },
    }),
  );
}

export const enabledProviders = {
  google: Boolean(process.env.AUTH_GOOGLE_ID),
  email: Boolean(process.env.AUTH_RESEND_KEY),
  dev: devLoginEnabled,
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  providers,
  pages: { signIn: "/login", verifyRequest: "/login?check=email", error: "/login" },
  callbacks: {
    // Only people the admin has added (and not deactivated) can sign in.
    async signIn({ user }) {
      const email = user.email?.toLowerCase().trim();
      if (!email) return false;
      const existing = await db.user.findUnique({ where: { email } });
      return Boolean(existing?.active);
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const u = await db.user.findUnique({ where: { email: user.email.toLowerCase() } });
        if (u) token.uid = u.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      return session;
    },
  },
});
