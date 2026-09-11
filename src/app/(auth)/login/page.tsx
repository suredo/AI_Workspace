"use client";

import { Suspense, useEffect, useActionState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { loginAction } from "./actions";

function LoginForm() {
  const [state, formAction, isPending] = useActionState(loginAction, undefined);
  const searchParams = useSearchParams();
  const router = useRouter();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  useEffect(() => {
    let cancelled = false;
    async function checkSession() {
      try {
        const res = await fetch("/api/auth/session");
        const data = await res.json();
        if (!cancelled && data?.user) {
          router.replace(callbackUrl);
        }
      } catch {
        // Ignore errors — stay on login page
      }
    }
    checkSession();
    return () => { cancelled = true; };
  }, [router, callbackUrl]);

  return (
    <div className="rounded-lg border border-line bg-elevated p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Sign In</h1>
        <p className="mt-1 text-sm text-secondary">
          Welcome back to AI Workspace
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-secondary">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded border border-line bg-app px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-secondary">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded border border-line bg-app px-3 py-2 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none"
            placeholder="Your password"
          />
        </div>
        {state?.error && (
          <div className="rounded border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            {state.error}
          </div>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-secondary">
        Don&apos;t have an account?{" "}
        <a
          href="/register"
          className="font-medium text-accent hover:text-accent-hover"
        >
          Create one
        </a>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
