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

export function roleBadgeColor(role: string): string {
  switch (role) {
    case "owner":
      return "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200";
    case "admin":
      return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
    default:
      return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200";
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
      <aside className="absolute top-0 right-0 flex h-full w-80 max-w-[85vw] flex-col bg-white shadow-xl dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Members{" "}
            <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
              ({members.length})
            </span>
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close members sidebar"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <ul className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {members.map((member) => (
            <li key={member.id} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-400">
                  {member.display_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {member.display_name}
                    {member.user_id === ownerId && (
                      <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                        (owner)
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {member.email}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(member.role)}`}
                >
                  {member.role}
                </span>
                {member.daily_cap_cents !== null && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
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
