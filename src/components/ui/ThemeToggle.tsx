"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

function ThemeIcon({ value }: { value: (typeof OPTIONS)[number]["value"] }) {
  if (value === "light") {
    return (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
        aria-hidden
      >
        <circle cx="12" cy="12" r="4" />
        <path
          strokeLinecap="round"
          d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        />
      </svg>
    );
  }
  if (value === "dark") {
    return (
      <svg
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.8}
        stroke="currentColor"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"
        />
      </svg>
    );
  }
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.8}
      stroke="currentColor"
      aria-hidden
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path strokeLinecap="round" d="M8 21h8m-4-4v4" />
    </svg>
  );
}

// False on the server, true after hydration: the resolved theme is
// client-only, so this guards against a hydration mismatch.
function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    // Avoid a hydration mismatch: the resolved theme is client-only.
    return (
      <div
        aria-hidden
        className="h-8 w-[104px] rounded-md border border-gray-300 dark:border-gray-700"
      />
    );
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="flex overflow-hidden rounded-md border border-gray-300 dark:border-gray-700"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            title={option.label}
            aria-label={`${option.label} theme`}
            className={`flex h-8 w-8 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            <ThemeIcon value={option.value} />
          </button>
        );
      })}
    </div>
  );
}
