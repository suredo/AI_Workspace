"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

const OPTIONS = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
] as const;

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
        className="h-8 w-44 rounded-md border border-gray-300 dark:border-gray-700"
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
            className={`px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
              active
                ? "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
                : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
