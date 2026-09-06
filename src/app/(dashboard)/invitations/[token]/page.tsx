"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface InvitationInfo {
  workspace_name: string;
  workspace_id: string;
  created_by_name: string;
  expires_at: string;
}

export default function InvitationAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [infoRes, sessionRes] = await Promise.all([
          fetch(`/api/invitations/${token}/info`),
          fetch("/api/auth/session"),
        ]);

        if (!cancelled) {
          const sessionData = await sessionRes.json();
          setAuthenticated(sessionData !== null && !!sessionData?.user);
        }

        if (!infoRes.ok) {
          throw new Error("Invalid or expired invitation");
        }
        const infoData = await infoRes.json();
        if (!cancelled) {
          setInvitation(infoData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load invitation");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [token]);

  async function handleAccept() {
    setAccepting(true);
    try {
      const res = await fetch(`/api/invitations/${token}/accept`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to accept invitation");
      }

      setAccepted(true);
      setTimeout(() => {
        router.push(`/workspaces/${data.workspace_id}`);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
    } finally {
      setAccepting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="text-gray-500">Loading invitation...</div>
      </div>
    );
  }

  if (accepted) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome!</h1>
          <p className="text-gray-600">
            You&apos;ve joined <strong>{invitation?.workspace_name}</strong>.
          </p>
          <p className="text-sm text-gray-500">Redirecting to workspace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Invalid Invitation</h1>
          <p className="text-gray-600">{error}</p>
          <Link href="/dashboard" className="inline-block text-blue-600 hover:text-blue-500 text-sm">
            Go to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!authenticated && invitation) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm text-center space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Join Workspace</h1>
          <p className="text-gray-600">
            You&apos;ve been invited to join <strong>{invitation.workspace_name}</strong>
          </p>
          <p className="text-sm text-gray-500">
            Invited by {invitation.created_by_name}
          </p>
          <div className="pt-4">
            <Link
              href={`/login?callbackUrl=${encodeURIComponent(`/invitations/${token}`)}`}
              className="inline-block w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 text-center"
            >
              Sign in to join
            </Link>
          </div>
          <p className="pt-2">
            <Link href={`/register?callbackUrl=${encodeURIComponent(`/invitations/${token}`)}`} className="text-sm text-blue-600 hover:text-blue-500">
              Create an account
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="rounded-lg border border-gray-200 bg-white p-8 shadow-sm text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100">
          <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Join Workspace</h1>
        <p className="text-gray-600">
          You&apos;ve been invited to join <strong>{invitation?.workspace_name}</strong>
        </p>
        <p className="text-sm text-gray-500">
          Invited by {invitation?.created_by_name}
        </p>
        <div className="pt-4">
          <button
            onClick={handleAccept}
            disabled={accepting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {accepting ? "Joining..." : "Join Workspace"}
          </button>
        </div>
        <p className="pt-2">
          <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
            Maybe later
          </Link>
        </p>
      </div>
    </div>
  );
}
