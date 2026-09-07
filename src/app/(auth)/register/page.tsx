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
    <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
        <p className="mt-1 text-sm text-gray-600">
          Join AI Workspace to collaborate with your team
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label
            htmlFor="displayName"
            className="block text-sm font-medium text-gray-700"
          >
            Display Name
          </label>
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
              errors.displayName
                ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            }`}
            placeholder="Your name"
            disabled={isSubmitting}
          />
          {errors.displayName && (
            <p className="mt-1 text-xs text-red-600">{errors.displayName}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium text-gray-700"
          >
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
              errors.email
                ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            }`}
            placeholder="you@example.com"
            disabled={isSubmitting}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email}</p>
          )}
        </div>

        <div>
          <label
            htmlFor="password"
            className="block text-sm font-medium text-gray-700"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`mt-1 block w-full rounded-md border bg-white px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-1 ${
              errors.password
                ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            }`}
            placeholder="At least 8 characters"
            disabled={isSubmitting}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password}</p>
          )}
        </div>

        {errors.submit && (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
            {errors.submit}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-600">
        Already have an account?{" "}
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          className="font-medium text-blue-600 hover:text-blue-500"
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
