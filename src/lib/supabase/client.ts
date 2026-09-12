import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  // NOTE: Next.js only inlines process.env keys it can statically analyze,
  // so these MUST stay literal accesses — getEnvOrThrow(name) with a
  // dynamic key compiles to a runtime lookup that is always undefined in
  // the browser bundle.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_URL"
    );
  }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) {
    throw new Error(
      "Missing required environment variable: NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return createBrowserClient(url, anonKey);
}
