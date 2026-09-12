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
      <div className="flex h-full items-center justify-center">
        <div className="text-sm text-muted">Loading workspace...</div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-sm text-red-500">{error || "Workspace not found"}</p>
          <Link href="/dashboard" className="text-sm text-accent hover:text-accent-hover">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {/* Slim header: title left, controls right */}
      <div className="shrink-0 border-b border-divider px-4 py-3 md:px-6">
        <div className="mx-auto flex w-full max-w-[min(92%,100rem)] items-center justify-between gap-2">
          <div className="min-w-0 pl-10 md:pl-0">
            <h1 className="truncate text-base font-semibold text-ink">{workspace.name}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex items-center gap-1.5 text-sm text-secondary hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Users className="h-4 w-4" aria-hidden />
              Members ({workspace.members.length})
            </button>
            {canInvite && (
              <Link
                href={`/workspaces/${workspaceId}/settings`}
                className="text-sm text-secondary hover:text-ink"
              >
                Settings
              </Link>
            )}
          </div>
        </div>
      </div>
      <ChatPanel
        workspaceId={workspaceId}
        currentUserId={currentUserId}
        members={workspace.members}
      />
      <MembersSidebar
        members={workspace.members}
        ownerId={workspace.owner_id}
        open={sidebarOpen}
        onClose={closeSidebar}
      />
    </div>
  );
}
