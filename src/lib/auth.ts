import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const BCRYPT_ROUNDS = 12;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

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

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export const authOptions: NextAuthOptions = {
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const context = "auth:authorize";

        if (!credentials?.email || !credentials?.password) {
          logger.warn(context, "Missing credentials", {
            hasEmail: !!credentials?.email,
          });
          return null;
        }

        const email = normalizeEmail(credentials.email);

        let supabase;
        try {
          supabase = await createClient();
        } catch (error) {
          logger.error(context, "Failed to create Supabase client", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }

        let user;
        try {
          const result = await supabase
            .from("users")
            .select("id, email, password_hash, display_name")
            .eq("email", email)
            .single();

          user = result.data;

          if (result.error) {
            logger.error(context, "Supabase query failed", {
              code: result.error.code,
              message: result.error.message,
            });
            return null;
          }
        } catch (error) {
          logger.error(context, "Supabase request failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }

        // If user not found, still run bcrypt to prevent timing-based account enumeration
        if (!user || !user.password_hash) {
          if (!user) {
            logger.info(context, "User not found", { email });
          } else {
            logger.error(context, "User has no password_hash", {
              userId: user.id,
            });
          }
          // Run bcrypt with dummy hash to keep timing consistent
          await bcrypt.compare(credentials.password as string, "$2a$12$x".padEnd(60, "0"));
          return null;
        }

        let isValid: boolean;
        try {
          isValid = await bcrypt.compare(
            credentials.password as string,
            user.password_hash
          );
        } catch (error) {
          logger.error(context, "bcrypt.compare failed", {
            userId: user.id,
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }

        if (!isValid) {
          logger.info(context, "Invalid credentials", { email });
          return null;
        }

        if (typeof user.id !== "string" || !user.id) {
          logger.error(context, "Invalid user id", { userId: user.id });
          return null;
        }

        logger.info(context, "Login successful", {
          userId: user.id,
          email: user.email,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.display_name,
        };
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
      if (user) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.userId && session.user) {
        session.user.id = token.userId;
      }
      return session;
    },
  },
};
