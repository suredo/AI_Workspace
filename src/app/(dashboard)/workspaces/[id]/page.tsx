"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

interface Member {
  id: string;
  user_id: string;
  role: string;
  daily_cap_cents: number;
  joined_at: string;
  display_name: string;
  email: string;
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

function roleBadgeColor(role: string): string {
  switch (role) {
    case "owner":
      return "bg-purple-100 text-purple-800";
    case "admin":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-gray-100 text-gray-800";
  }
}

export default function WorkspaceDetailPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        <div className="text-gray-500">Loading workspace...</div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-red-600">{error || "Workspace not found"}</p>
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-500 text-sm">
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const isOwner = workspace.current_user_membership.role === "owner";
  const isAdmin = workspace.current_user_membership.role === "admin";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to Dashboard
          </Link>
          <div className="mt-2 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{workspace.name}</h1>
              <p className="mt-1 text-sm text-gray-600">
                Created {formatDate(workspace.created_at)} &middot; {workspace.members.length} {workspace.members.length === 1 ? "member" : "members"}
              </p>
            </div>
            {(isOwner || isAdmin) && (
              <Link
                href={`/workspaces/${workspaceId}/settings`}
                className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Settings
              </Link>
            )}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Chat Area (placeholder) */}
          <div className="lg:col-span-2">
            <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 px-6 py-4">
                <h2 className="text-lg font-semibold text-gray-900">Chat</h2>
              </div>
              <div className="flex h-96 items-center justify-center text-gray-400">
                <div className="text-center space-y-2">
                  <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
                  </svg>
                  <p className="text-sm">Chat coming soon</p>
                </div>
              </div>
              <div className="border-t border-gray-200 px-6 py-4">
                <div className="flex gap-3">
                  <input
                    type="text"
                    disabled
                    placeholder="Chat messages will appear here..."
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-400"
                  />
                  <button
                    disabled
                    className="rounded-md bg-gray-300 px-4 py-2 text-sm font-medium text-gray-500 cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* System Prompt */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">System Prompt</h2>
              <p className="mt-2 text-sm text-gray-600 whitespace-pre-wrap">
                {workspace.system_prompt}
              </p>
            </div>

            {/* Members */}
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-gray-900">Members</h2>
              <ul className="mt-4 space-y-3">
                {workspace.members.map((member) => (
                  <li key={member.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-sm font-medium text-gray-600">
                        {member.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {member.display_name}
                          {member.user_id === workspace.owner_id && (
                            <span className="ml-1 text-xs text-gray-400">(you)</span>
                          )}
                        </p>
                        <p className="text-xs text-gray-500">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleBadgeColor(member.role)}`}>
                        {member.role}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatCap(member.daily_cap_cents)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
