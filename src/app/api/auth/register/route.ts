import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createClient } from "@/lib/supabase/server";
import { BCRYPT_ROUNDS } from "@/lib/auth-helpers";
import { logger } from "@/lib/logger";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
const MAX_DISPLAY_NAME_LENGTH = 100;

interface RegisterBody {
  email?: string;
  password?: string;
  displayName?: string;
}

function validateInput(body: RegisterBody): string[] {
  const errors: string[] = [];

  if (!body.email || typeof body.email !== "string") {
    errors.push("Email is required");
  } else if (!EMAIL_REGEX.test(body.email.trim())) {
    errors.push("Invalid email format");
  }

  if (!body.password || typeof body.password !== "string") {
    errors.push("Password is required");
  } else if (body.password.length < MIN_PASSWORD_LENGTH) {
    errors.push(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  if (!body.displayName || typeof body.displayName !== "string") {
    errors.push("Display name is required");
  } else if (body.displayName.trim().length === 0) {
    errors.push("Display name cannot be empty");
  } else if (body.displayName.trim().length > MAX_DISPLAY_NAME_LENGTH) {
    errors.push(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`);
  }

  return errors;
}

export async function POST(request: Request) {
  const context = "api:auth:register";

  let body: RegisterBody;
  try {
    body = await request.json();
  } catch {
    logger.warn(context, "Invalid JSON body");
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }

  const validationErrors = validateInput(body);
  if (validationErrors.length > 0) {
    logger.warn(context, "Validation failed", { errors: validationErrors });
    return NextResponse.json(
      { error: "Validation failed", details: validationErrors },
      { status: 400 }
    );
  }

  const email = body.email!.trim().toLowerCase();
  const password = body.password!;
  const displayName = body.displayName!.trim();

  let supabase;
  try {
    supabase = await createClient();
  } catch (error) {
    logger.error(context, "Failed to create Supabase client", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // Check for duplicate email
  try {
    const { data: existingUser } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();

    if (existingUser) {
      logger.warn(context, "Duplicate email registration attempt", { email });
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      );
    }
  } catch (error) {
    // PGRST116 = no rows found, which is fine (user doesn't exist)
    if (error && typeof error === "object" && "code" in error && error.code !== "PGRST116") {
      logger.error(context, "Supabase duplicate check failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  }

  // Hash password
  let passwordHash: string;
  try {
    passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  } catch (error) {
    logger.error(context, "bcrypt.hash failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  // Insert user
  try {
    const { error: insertError } = await supabase.from("users").insert({
      email,
      password_hash: passwordHash,
      display_name: displayName,
    });

    if (insertError) {
      // Unique constraint violation (race condition with duplicate check)
      if (insertError.code === "23505") {
        logger.warn(context, "Duplicate email on insert (race condition)", { email });
        return NextResponse.json(
          { error: "An account with this email already exists" },
          { status: 409 }
        );
      }

      logger.error(context, "Supabase insert failed", {
        code: insertError.code,
        message: insertError.message,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  } catch (error) {
    logger.error(context, "Supabase insert request failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }

  logger.info(context, "User registered successfully", { email });

  return NextResponse.json(
    { message: "Account created successfully" },
    { status: 201 }
  );
}
