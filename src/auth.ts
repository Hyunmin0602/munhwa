import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, LOGIN_EMAIL_LIMIT } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/validation";
import { withDbReadRetry } from "@/lib/db-retry";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      authorize: async (credentials, request) => {
        if (!credentials?.email || !credentials?.password) return null;

        let email: string;
        try {
          email = normalizeEmail(credentials.email);
        } catch {
          return null;
        }
        const emailLimit = await checkRateLimit(request, "login-email", email, LOGIN_EMAIL_LIMIT);
        if (!emailLimit.allowed) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.password) return null;

        const isValid = await bcrypt.compare(
          credentials.password as string,
          user.password
        );
        if (!isValid) return null;
        if (user.registrationStatus !== "APPROVED") return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    // Keep users signed in across long sessions while still refreshing token metadata.
    maxAge: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 12,
  },
  jwt: {
    maxAge: 60 * 60 * 24 * 14,
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      if (token.id) {
        const currentUser = await withDbReadRetry(() => prisma.user.findUnique({
          where: { id: token.id as string },
          select: { registrationStatus: true },
        }));
        token.accountActive = currentUser?.registrationStatus === "APPROVED";
      }
      return token;
    },
    session({ session, token }) {
      if (!session.user || !token.id || token.accountActive !== true) {
        return { ...session, user: undefined } as unknown as typeof session;
      }
      session.user.id = token.id as string;
      return session;
    },
  },
  pages: { signIn: "/login" },
  secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
});
