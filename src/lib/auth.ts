import { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export const BCRYPT_ROUNDS = 12;
const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // 7 days in seconds

// Dummy bcrypt hash for timing-attack defense.
// Cost matches production (12 rounds). Must be a valid bcrypt hash string.
const DUMMY_BCRYPT_HASH =
  "$2a$12$VQ4Hn.sTx.pMFzJhPzOBCeQGzVkFpRUMbMFZxPzLpEdBrDnHJqkNm";

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
          const { data, error } = await supabase
            .from("users")
            .select("id, email, password_hash, display_name")
            .eq("email", email)
            .single();

          if (error) {
            logger.warn(context, "Supabase query failed", {
              code: error.code,
            });
            return null;
          }

          // Explicitly handle { data: null, error: null }
          if (!data) {
            logger.debug(context, "User not found");
            // Timing-attack defense: run dummy bcrypt even when user is null
            try {
              await bcrypt.compare(credentials.password as string, DUMMY_BCRYPT_HASH);
            } catch {
              // Swallow — timing protection still applied
            }
            return null;
          }

          user = data;
        } catch (error) {
          logger.error(context, "Supabase request failed", {
            error: error instanceof Error ? error.message : String(error),
          });
          return null;
        }

        // If user has no password_hash, still run bcrypt for timing consistency
        if (!user.password_hash) {
          logger.warn(context, "User has no password_hash", {
            userId: user.id,
          });
          try {
            await bcrypt.compare(credentials.password as string, DUMMY_BCRYPT_HASH);
          } catch {
            // Swallow — timing protection still applied
          }
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
          logger.debug(context, "Invalid credentials");
          return null;
        }

        if (typeof user.id !== "string" || !user.id) {
          logger.error(context, "Invalid user id");
          return null;
        }

        logger.info(context, "Login successful", {
          userId: user.id,
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
      if (user?.id) {
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token?.userId && session.user) {
        session.user.id = String(token.userId);
      }
      return session;
    },
  },
};
