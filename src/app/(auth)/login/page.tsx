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
    <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Sign In</h1>
        <p className="mt-1 text-sm text-gray-600">
          Welcome back to AI Workspace
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="callbackUrl" value={callbackUrl} />
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Your password"
          />
        </div>
        {state?.error && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {state.error}
          </div>
        )}
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isPending ? "Signing in..." : "Sign In"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-600">
        Don&apos;t have an account?{" "}
        <a
          href="/register"
          className="font-medium text-blue-600 hover:text-blue-500"
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
