"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { EMAIL_REGEX, MIN_PASSWORD_LENGTH, MAX_DISPLAY_NAME_LENGTH } from "@/lib/validation";

interface FormErrors {
  email?: string;
  password?: string;
  displayName?: string;
  submit?: string;
}

function validateForm(email: string, password: string, displayName: string): FormErrors {
  const errors: FormErrors = {};

  if (!email) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(email)) {
    errors.email = "Invalid email format";
  }

  if (!password) {
    errors.password = "Password is required";
  } else if (password.length < MIN_PASSWORD_LENGTH) {
    errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }

  const trimmedName = displayName.trim();
  if (!trimmedName) {
    errors.displayName = "Display name is required";
  } else if (trimmedName.length > MAX_DISPLAY_NAME_LENGTH) {
    errors.displayName = `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or less`;
  }

  return errors;
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const validationErrors = validateForm(email, password, displayName);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, displayName }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          setErrors({ email: data.error });
        } else if (response.status === 400 && data.details) {
          const serverErrors: FormErrors = {};
          for (const detail of data.details) {
            if (detail.includes("email")) serverErrors.email = detail;
            else if (detail.includes("password")) serverErrors.password = detail;
            else if (detail.includes("Display name")) serverErrors.displayName = detail;
          }
          setErrors(serverErrors);
        } else {
          setErrors({ submit: data.error || "Registration failed" });
        }
        return;
      }

      router.push(`/login?registered=true&callbackUrl=${encodeURIComponent(callbackUrl)}`);
    } catch {
      setErrors({ submit: "Network error. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-lg border border-line bg-elevated p-8">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-ink">Create Account</h1>
        <p className="mt-1 text-sm text-secondary">
          Join AI Workspace to collaborate with your team
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-secondary"
          >
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={`mt-1 block w-full rounded border bg-app px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none ${
              errors.displayName
                ? "border-red-500 focus:border-red-500"
                : "border-line focus:border-accent"
            }`}
            placeholder="Your name"
            disabled={isSubmitting}
          />
          {errors.displayName && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errors.displayName}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-secondary"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1 block w-full rounded border bg-app px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none ${
              errors.email
                ? "border-red-500 focus:border-red-500"
                : "border-line focus:border-accent"
            }`}
            placeholder="you@example.com"
            disabled={isSubmitting}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errors.email}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-secondary"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1 block w-full rounded border bg-app px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none ${
              errors.password
                ? "border-red-500 focus:border-red-500"
                : "border-line focus:border-accent"
            }`}
            placeholder="At least 8 characters"
            disabled={isSubmitting}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-300">{errors.password}</p>
          )}
        </div>

        {errors.submit && (
          <div className="rounded border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-300">
            {errors.submit}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-secondary">
        Already have an account?{" "}
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="font-medium text-accent hover:text-accent-hover"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
