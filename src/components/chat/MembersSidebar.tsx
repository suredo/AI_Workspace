"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export interface Member {
  id: string;
  user_id: string;
  role: string;
  daily_cap_cents: number | null;
  display_name: string;
  email: string;
}

export function formatCap(cents: number): string {
  return `$${(cents / 100).toFixed(2)}/day`;
}

export function roleDotColor(role: string): string {
  switch (role) {
    case "owner":
      return "bg-accent";
    case "admin":
      return "bg-sky-400";
    default:
      return "bg-muted/50";
  }
}

export default function MembersSidebar({
  members,
  ownerId,
  open,
  onClose,
}: {
  members: Member[];
  ownerId: string;
  open: boolean;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Workspace members"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <aside className="absolute top-0 right-0 flex h-full w-80 max-w-[85vw] flex-col border-l border-line bg-sidebar">
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <h2 className="text-base font-semibold text-ink">
            Members{" "}
            <span className="text-sm font-normal text-muted">
              ({members.length})
            </span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close members sidebar"
            className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <ul className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-elevated text-sm font-medium text-secondary">
                  {member.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">
                    {member.display_name}
                    {member.user_id === ownerId && (
                      <span className="ml-1 text-xs text-muted">
                        (owner)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted">
                    {member.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${roleDotColor(member.role)}`}
                  aria-hidden
                />
                <span className="text-xs text-secondary">
                  {member.role}
                </span>
                {member.daily_cap_cents !== null && (
                  <span className="font-mono text-xs text-muted">
                    {formatCap(member.daily_cap_cents)}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
