"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun } from "lucide-react";

const OPTIONS = [
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
  { value: "system", label: "System", Icon: Monitor },
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
        className="h-8 w-[104px] rounded-md border border-line"
      />
    );
  }

  return (
    <div
      role="group"
      aria-label="Color theme"
      className="flex overflow-hidden rounded-md border border-line"
    >
      {OPTIONS.map((option) => {
        const active = theme === option.value;
        const Icon = option.Icon;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setTheme(option.value)}
            aria-pressed={active}
            title={option.label}
            aria-label={`${option.label} theme`}
            className={`flex h-8 w-8 items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
              active
                ? "bg-accent-wash text-accent"
                : "text-muted hover:bg-hover hover:text-ink"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
