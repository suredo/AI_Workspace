"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, PanelLeftClose, PanelLeftOpen, Plus, X } from "lucide-react";
import ThemeToggle from "@/components/ui/ThemeToggle";
import CreateWorkspaceModal from "@/components/workspace/CreateWorkspaceModal";
import type { WorkspaceWithMembers } from "@/lib/types";
import { signOutAction } from "@/app/(dashboard)/actions";

function workspaceIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/workspaces\/([^/]+)/);
  return match ? match[1] : null;
}

export default function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Default expanded so server and client render the same HTML; the stored
  // preference is applied after hydration to avoid a hydration mismatch.
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [workspaces, setWorkspaces] = useState<WorkspaceWithMembers[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);

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
    // Refetch on navigation: the layout persists across client-side route
    // changes, so a freshly created workspace would otherwise stay invisible.
  }, [pathname]);

  useEffect(() => {
    try {
      if (window.localStorage.getItem("app-sidebar-collapsed") === "1") {
        // Sync-on-mount from storage: intentional, keeps SSR and first
        // client render identical (expanded) to avoid a hydration mismatch.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setDesktopCollapsed(true);
      }
    } catch {
      // Persistence is best-effort; the sidebar stays expanded.
    }
  }, []);

  useEffect(() => {
    // DOM sync only (no setState): move focus into the drawer when it opens.
    if (mobileOpen) drawerCloseRef.current?.focus();
  }, [mobileOpen]);

  function closeMobile() {
    setMobileOpen(false);
  }

  function toggleDesktopCollapsed() {
    setDesktopCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem("app-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Persistence is best-effort; the toggle still works for the session.
      }
      return next;
    });
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
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white transition-[width,transform] duration-200 ease-in-out dark:border-gray-800 dark:bg-gray-900 md:sticky md:top-0 md:h-dvh md:max-w-none md:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        } ${desktopCollapsed ? "md:w-16" : "md:w-72"}`}
      >
        <div
          className={`flex items-center justify-between px-4 py-3 ${
            desktopCollapsed ? "md:flex-col md:justify-center md:gap-2 md:px-2" : ""
          }`}
        >
          <Link
            href="/dashboard"
            onClick={closeMobile}
            className={`text-lg font-semibold text-gray-900 dark:text-gray-100 ${
              desktopCollapsed ? "md:hidden" : ""
            }`}
          >
            AI Workspace
          </Link>
          {desktopCollapsed && (
            <span
              aria-hidden
              className="hidden h-8 w-8 items-center justify-center rounded-md bg-gray-900 text-sm font-semibold text-white md:flex dark:bg-gray-100 dark:text-gray-900"
            >
              AI
            </span>
          )}
          <button
            type="button"
            ref={drawerCloseRef}
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={toggleDesktopCollapsed}
            aria-expanded={!desktopCollapsed}
            aria-label={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={desktopCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:flex dark:text-gray-400 dark:hover:bg-gray-800"
          >
            {desktopCollapsed ? (
              <PanelLeftOpen className="h-5 w-5" aria-hidden />
            ) : (
              <PanelLeftClose className="h-5 w-5" aria-hidden />
            )}
          </button>
        </div>
        <div
          className={`flex items-center justify-between px-4 py-2 ${
            desktopCollapsed ? "md:justify-center md:px-2" : ""
          }`}
        >
          <span
            className={`text-xs font-semibold tracking-wider text-gray-500 uppercase dark:text-gray-400 ${
              desktopCollapsed ? "md:hidden" : ""
            }`}
          >
            Workspaces
          </span>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            aria-label="New workspace"
            title="New workspace"
            className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-gray-400 dark:hover:bg-gray-800"
          >
            <Plus className="h-4 w-4" aria-hidden />
          </button>
        </div>
        <nav aria-label="Workspaces" className="flex-1 space-y-1 overflow-x-hidden overflow-y-auto overscroll-contain px-2">
          {workspaces.length === 0 && (
            <p
              className={`px-3 py-2 text-sm text-gray-500 dark:text-gray-400 ${
                desktopCollapsed ? "md:hidden" : ""
              }`}
            >
              No workspaces yet
            </p>
          )}
          {workspaces.map((workspace) => {
            const active = workspace.id === activeId;
            const itemClass = active
              ? "bg-gray-100 font-medium text-gray-900 dark:bg-gray-800 dark:text-gray-100"
              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-800";
            if (desktopCollapsed) {
              return (
                <span key={workspace.id} className="block">
                  <Link
                    href={`/workspaces/${workspace.id}`}
                    onClick={closeMobile}
                    aria-current={active ? "page" : undefined}
                    className={`block truncate rounded-md px-3 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:hidden ${itemClass}`}
                  >
                    {workspace.name}
                  </Link>
                  <Link
                    href={`/workspaces/${workspace.id}`}
                    onClick={closeMobile}
                    aria-current={active ? "page" : undefined}
                    title={workspace.name}
                    aria-label={workspace.name}
                    className={`hidden justify-center rounded-md px-2 py-2 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 md:flex ${itemClass}`}
                  >
                    <span aria-hidden>
                      {workspace.name.charAt(0).toUpperCase()}
                    </span>
                  </Link>
                </span>
              );
            }
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
        <div
          className={`flex items-center justify-between gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-800 ${
            desktopCollapsed ? "md:flex-col md:justify-center md:px-2" : ""
          }`}
        >
          <span className={desktopCollapsed ? "md:hidden" : ""}>
            <ThemeToggle />
          </span>
          <button
            type="button"
            onClick={() => signOutAction()}
            aria-label="Log out"
            title="Log out"
            className="flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            <span className={desktopCollapsed ? "md:hidden" : ""}>Log out</span>
          </button>
        </div>
      </aside>
      {showCreateModal && (
        <CreateWorkspaceModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={(id) => {
            setShowCreateModal(false);
            setMobileOpen(false);
            router.push(`/workspaces/${id}`);
          }}
        />
      )}
    </>
  );
}
