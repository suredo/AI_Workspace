import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authorize, jwtCallback, sessionCallback } from "@/lib/auth-helpers";

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

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}

const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: process.env.NODE_ENV !== "production",
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        return authorize(credentials as Record<string, unknown>);
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE,
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      return jwtCallback({ token, user });
    },
    async session({ session, token }) {
      return sessionCallback({ session, token });
    },
  },
});
