"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, Menu, Plus, X } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import type { WorkspaceWithMembers } from "@/lib/types";
import { signOutAction } from "@/app/(dashboard)/actions";

function workspaceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/workspaces\/([^/]+)/);
  return match ? match[1] : null;
}

export default function AppSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);

  const activeId = workspaceIdFromPath(pathname);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/workspaces");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) {
          setWorkspaces(data.workspaces || []);
        }
      } catch {
        // Sidebar list is non-critical; the dashboard page shows errors.
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function closeMobile() {
    setMobileOpen(false);
  }

  return (
    <>
      {/* Mobile trigger: page headers leave room for this on small screens */}
      {!mobileOpen && (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="fixed top-3 left-3 z-20 rounded-md p-2 text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden dark:text-gray-300 dark:hover:bg-gray-800"
        >
          <Menu className="h-5 w-5" aria-hidden />
        </button>
      )}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col border-r border-gray-200 bg-white transition-transform dark:border-gray-800 dark:bg-gray-900 md:static md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className="text-lg font-semibold text-gray-900 dark:text-gray-100"
          >
            AI Workspace
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400">
            Workspaces
          </span>
          <Link
            href="/dashboard"
            aria-label="New workspace"
            title="New workspace"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <nav aria-label="Workspaces" className="flex-1 space-y-1 overflow-y-auto px-2">
          {workspaces.map((workspace) => {
            const active = workspace.id === activeId;
            return (
              <Link
                key={workspace.id}
                href={`/workspaces/${workspace.id}`}
                onClick={closeMobile}
                aria-current={active ? "page" : undefined}
                className={`block truncate rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  active
                    ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100"
                    : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800"
                }`}
              >
                {workspace.name}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => signOutAction()}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Log out
          </button>
        </div>
      </aside>
    </>
  );
}
