"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ChatPanel from "@/components/chat/ChatPanel";

interface Member {
  id: string;
  user_id: string;
  role: string;
  daily_cap_cents: number;
  joined_at: string;
  display_name: string;
  email: string;
}

interface Invitation {
  id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  created_by_name: string;
}

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

function formatCap(cents: number): string {
  return `$${(cents / 100).toFixed(2)}/day`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatExpiry(dateStr: string): string {
  const expires = new Date(dateStr);
  const now = new Date();
  const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 0) return "Expired";
  if (daysLeft === 1) return "Expires tomorrow";
  return `Expires in ${daysLeft} days`;
}

function roleBadgeColor(role: string): string {
  switch (role) {
    case "owner":
      return "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200";
    case "admin":
      return "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200";
    default:
      return "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200";
  }
}

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invitation state
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const isOwner = workspace?.current_user_membership.role === "owner";
  const isAdmin = workspace?.current_user_membership.role === "admin";
  const canInvite = isOwner || isAdmin;
  const currentUserId =
    workspace?.members.find((m) => m.id === workspace.current_user_membership.id)
      ?.user_id ?? null;

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

  useEffect(() => {
    if (!workspace || !canInvite) return;
    let cancelled = false;
    async function load() {
      setInvitationsLoading(true);
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/invitations`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setInvitations(data.invitations || []);
          }
        }
      } finally {
        if (!cancelled) {
          setInvitationsLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [workspace, canInvite, workspaceId]);

  async function handleCreateInvite() {
    setCreatingInvite(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: "POST",
      });
      if (res.ok) {
        // Refresh invitations list
        const listRes = await fetch(`/api/workspaces/${workspaceId}/invitations`);
        if (listRes.ok) {
          const data = await listRes.json();
          setInvitations(data.invitations || []);
        }
      }
    } finally {
      setCreatingInvite(false);
    }
  }

  async function copyInviteLink(token: string) {
    const url = `${window.location.origin}/invitations/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  }

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
              <Link
                href={`/workspaces/${workspaceId}/settings`}
                className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Settings
              </Link>
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

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Chat Area (placeholder) */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
              <div className="border-b border-gray-200 dark:border-gray-800 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Chat</h2>
              </div>
              <ChatPanel workspaceId={workspaceId} currentUserId={currentUserId} />
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Members */}
            <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Members</h2>
              <ul className="mt-4 space-y-3">
                {workspace.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400">
                        {member.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {member.display_name}
                          {member.user_id === workspace.owner_id && (
                            <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">(owner)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(member.role)}`}>
                        {member.role}
                      </span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {formatCap(member.daily_cap_cents)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Invitations (owner/admin only) */}
            {canInvite && (
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invitations</h2>
                  <button
                    onClick={handleCreateInvite}
                    disabled={creatingInvite}
                    className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {creatingInvite ? "Creating..." : "Invite"}
                  </button>
                </div>

                {invitationsLoading ? (
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading...</p>
                ) : invitations.length === 0 ? (
                  <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">No pending invitations</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {invitations.map((inv) => (
                      <li key={inv.id} className="rounded-md bg-gray-50 dark:bg-gray-800 p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                              Created by {inv.created_by_name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {formatExpiry(inv.expires_at)}
                            </p>
                          </div>
                          <button
                            onClick={() => copyInviteLink(inv.token)}
                            className="rounded-md border border-gray-300 dark:border-gray-700 px-2 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                          >
                            {copiedToken === inv.token ? "Copied!" : "Copy link"}
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
