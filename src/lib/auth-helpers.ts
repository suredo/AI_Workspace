import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";
import type { Session } from "next-auth";

export const BCRYPT_ROUNDS = 12;

const DUMMY_BCRYPT_HASH =
  "$2a$12$VQ4Hn.sTx.pMFzJhPzOBCeQGzVkFpRUMbMFZxPzLpEdBrDnHJqkNm";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function authorize(
  credentials: Record<string, unknown> | undefined
) {
  const context = "auth:authorize";

  if (!credentials?.email || !credentials?.password) {
    logger.warn(context, "Missing credentials", {
      hasEmail: !!credentials?.email,
    });
    return null;
  }

  const email = normalizeEmail(String(credentials.email));

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

    if (!data) {
      logger.debug(context, "User not found");
      try {
        await bcrypt.compare(credentials.password as string, DUMMY_BCRYPT_HASH);
      } catch (error) {
        logger.warn(context, "Dummy bcrypt.compare failed", {
          error: error instanceof Error ? error.message : String(error),
        });
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

  logger.debug(context, "Login successful");

  return {
    id: user.id,
    email: user.email,
    name: user.display_name,
  };
}

export async function jwtCallback({
  token,
  user,
}: {
  token: Record<string, unknown>;
  user: { id?: string } | null;
}) {
  if (user?.id) {
    token.userId = user.id;
  }
  return token;
}

export async function sessionCallback({
  session,
  token,
}: {
  session: Session;
  token: Record<string, unknown>;
}): Promise<Session> {
  if (token?.userId && session.user) {
    session.user.id = String(token.userId);
  }
  return session;
}
