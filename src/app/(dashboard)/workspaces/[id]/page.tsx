"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Users } from "lucide-react";
import ChatPanel from "@/components/chat/ChatPanel";
import MembersSidebar, { type Member } from "@/components/chat/MembersSidebar";

interface WorkspaceDetail {
  id: string;
  name: string;
  owner_id: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
  current_user_membership: {
    id: string;
    role: string;
    daily_cap_cents: number;
    joined_at: string;
  };
  members: Member[];
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isOwner = workspace?.current_user_membership.role === "owner";
  const isAdmin = workspace?.current_user_membership.role === "admin";
  const canInvite = isOwner || isAdmin;
  const currentUserId =
    workspace?.members.find((m) => m.id === workspace.current_user_membership.id)
      ?.user_id ?? null;

  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}`);
        if (!res.ok) {
          throw new Error("Failed to fetch workspace");
        }
        const data = await res.json();
        if (!cancelled) {
          setWorkspace(data.workspace);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load workspace");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [workspaceId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500 dark:text-gray-400">Loading workspace...</div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-600 dark:text-red-400">{error || "Workspace not found"}</p>
          <Link href="/dashboard" className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 text-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
<div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div>
                <Link href="/dashboard" className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                  &larr; Back to Dashboard
                </Link>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  className="flex items-center gap-1.5 rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Users className="h-4 w-4" aria-hidden />
                  Members ({workspace.members.length})
                </button>
                {canInvite && (
                  <Link
                    href={`/workspaces/${workspaceId}/settings`}
                    className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Settings
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">{workspace.name}</h1>
                <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                  Created {formatDate(workspace.created_at)} &middot; {workspace.members.length} {workspace.members.length === 1 ? "member" : "members"}
                </p>
              </div>
            </div>
          </div>

        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
          <div className="flex h-[calc(100dvh-19rem)] min-h-[28rem] flex-col overflow-hidden">
            <div className="shrink-0 border-b border-gray-200 dark:border-gray-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Chat</h2>
            </div>
            <ChatPanel workspaceId={workspaceId} currentUserId={currentUserId} />
          </div>
        </div>
        <MembersSidebar
          members={workspace.members}
          ownerId={workspace.owner_id}
          open={sidebarOpen}
          onClose={closeSidebar}
        />
      </div>
    </div>
  );
}
