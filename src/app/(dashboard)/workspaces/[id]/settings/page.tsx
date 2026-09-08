"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Tab = "general" | "ai-provider" | "members" | "danger-zone";

interface WorkspaceConfig {
  llm_provider: string;
  llm_base_url: string;
  llm_api_key_set: boolean;
  llm_model: string;
}

interface Member {
  id: string;
  user_id: string;
  display_name: string;
  email: string;
  role: "owner" | "admin" | "member";
  daily_cap_cents: number;
  joined_at: string;
}

interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  system_prompt: string;
  current_user_membership: { role: "owner" | "admin" | "member"; id: string };
}

interface Invitation {
  id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  created_by_name: string;
}

interface MemberUsage {
  member_id: string;
  user_id: string;
  used_cents: number;
  cap_cents: number;
  remaining_cents: number;
}

const PROVIDER_DEFAULTS: Record<string, { baseUrl: string; model: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  together: { baseUrl: "https://api.together.xyz/v1", model: "meta-llama/Llama-3-70b-chat-hf" },
  fireworks: { baseUrl: "https://api.fireworks.ai/inference/v1", model: "accounts/fireworks/models/llama-v3-70b-instruct" },
  cerebras: { baseUrl: "https://api.cerebras.ai/v1", model: "llama3.1-70b" },
};

const ROLE_OPTIONS = ["admin", "member"] as const;

export default function SettingsPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const [activeTab, setActiveTab] = useState<Tab>("general");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [config, setConfig] = useState<WorkspaceConfig | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // General tab
  const [name, setName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");

  // AI Provider tab
  const [provider, setProvider] = useState("groq");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState("");
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Members tab
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<"admin" | "member">("member");
  const [editCap, setEditCap] = useState(500);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [invitationsLoading, setInvitationsLoading] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [memberUsage, setMemberUsage] = useState<Record<string, MemberUsage>>({});

// Danger zone
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchAllData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [wsRes, configRes, membersRes] = await Promise.all([
        fetch(`/api/workspaces/${workspaceId}`),
        fetch(`/api/workspaces/${workspaceId}/config`),
        fetch(`/api/workspaces/${workspaceId}/members`),
      ]);

      if (!wsRes.ok) throw new Error("Failed to load workspace");
      if (!configRes.ok) throw new Error("Failed to load config");
      if (!membersRes.ok) throw new Error("Failed to load members");

      const wsData = await wsRes.json();
      const configData = await configRes.json();
      const membersData = await membersRes.json();

      setWorkspace(wsData.workspace);
      setConfig(configData.config);
      setMembers(membersData.members);

      // Initialize form fields
      setName(wsData.workspace.name);
      setSystemPrompt(wsData.workspace.system_prompt);

      if (configData.config) {
        setProvider(configData.config.llm_provider);
        setBaseUrl(configData.config.llm_base_url);
        setModel(configData.config.llm_model);
      }
    } catch {
      setError("Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    // Data fetching on mount is a legitimate use case for setState in effect
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchAllData();
  }, [fetchAllData]);

  async function handleGeneralSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, system_prompt: systemPrompt }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaveSuccess(true);
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleProviderSave() {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const body: Record<string, string> = {
        llm_provider: provider,
        llm_base_url: baseUrl,
        llm_model: model,
      };

      if (apiKey.trim()) {
        body.llm_api_key = apiKey;
      }

      const res = await fetch(`/api/workspaces/${workspaceId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      setSaveSuccess(true);
      setApiKey("");
      router.refresh();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const body: Record<string, string> = {
        llm_provider: provider,
        llm_base_url: baseUrl,
        llm_model: model,
      };

      // Omit a blank key so the endpoint tests the saved key instead.
      if (apiKey.trim()) {
        body.llm_api_key = apiKey.trim();
      }

      const res = await fetch(`/api/workspaces/${workspaceId}/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (data.success) {
        setTestResult({ success: true, message: `Connected! Model: ${data.model}` });
      } else {
        setTestResult({ success: false, message: data.error?.message || "Connection failed" });
      }
    } catch {
      setTestResult({ success: false, message: "Network error" });
    } finally {
      setTestingConnection(false);
    }
  }

  function handleProviderChange(newProvider: string) {
    setProvider(newProvider);
    if (PROVIDER_DEFAULTS[newProvider]) {
      setBaseUrl(PROVIDER_DEFAULTS[newProvider].baseUrl);
      setModel(PROVIDER_DEFAULTS[newProvider].model);
    }
  }

  function startEditMember(member: Member) {
    if (member.role === "owner") return;
    setEditingMemberId(member.id);
    setEditRole(member.role);
    setEditCap(member.daily_cap_cents);
  }

  async function saveMemberEdit() {
    if (!editingMemberId) return;

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          member_id: editingMemberId,
          role: editRole,
          daily_cap_cents: editCap,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update member");
      }

      setEditingMemberId(null);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to update member");
    }
  }

  async function removeMember(memberId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/members?member_id=${memberId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to remove member");
      }

      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to remove member");
    }
  }

  async function handleDeleteWorkspace() {
    if (!confirmDelete) {
      alert("Please confirm by checking the box");
      return;
    }

    try {
      const res = await fetch(`/api/workspaces/${workspaceId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete workspace");
      }

      router.push("/dashboard");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to delete workspace");
    }
  }

  function formatCap(cents: number) {
    return `$${(cents / 100).toFixed(2)}`;
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString();
  }

  function formatExpiry(dateStr: string): string {
    const expires = new Date(dateStr);
    const now = new Date();
    const daysLeft = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 0) return "Expired";
    if (daysLeft === 1) return "Expires tomorrow";
    return `Expires in ${daysLeft} days`;
  }

  function roleBadge(role: string) {
    const colors: Record<string, string> = {
      owner: "bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200",
      admin: "bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200",
      member: "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200",
    };
    return colors[role] || "bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200";
  }

  const isOwner = workspace?.current_user_membership.role === "owner";
  const isAdmin = workspace?.current_user_membership.role === "admin";
  const canManageMembers = isOwner || isAdmin;
  const canManageProvider = isOwner;

  useEffect(() => {
    if (!canManageMembers || activeTab !== "members") return;
    let cancelled = false;
    async function loadInvitations() {
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
    loadInvitations();
    return () => { cancelled = true; };
  }, [workspaceId, activeTab, canManageMembers]);

  useEffect(() => {
    if (!isOwner || activeTab !== "members") return;
    let cancelled = false;
    async function loadUsage() {
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/members-usage`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            const byMember: Record<string, MemberUsage> = {};
            for (const u of (data.usage || []) as MemberUsage[]) {
              byMember[u.member_id] = u;
            }
            setMemberUsage(byMember);
          }
        }
      } catch {
        // Usage is supplementary; table still renders caps without it.
      }
    }
    loadUsage();
    return () => { cancelled = true; };
  }, [workspaceId, activeTab, isOwner]);

  async function handleCreateInvite() {
    setCreatingInvite(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/invitations`, {
        method: "POST",
      });
      if (res.ok) {
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
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="text-center text-gray-500 dark:text-gray-400">Loading settings...</div>
      </div>
    );
  }

  if (error || !workspace) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 text-center">
        <p className="text-red-600 dark:text-red-400">{error || "Workspace not found"}</p>
        <Link href="/dashboard" className="mt-4 text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300">
          Back to Dashboard
        </Link>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; disabled?: boolean }[] = [
    { id: "general", label: "General" },
    { id: "ai-provider", label: "AI Provider", disabled: !canManageProvider },
    { id: "members", label: "Members", disabled: !canManageMembers },
    { id: "danger-zone", label: "Danger Zone", disabled: !isOwner },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8">
        <Link href={`/workspaces/${workspaceId}`} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mb-4 block pl-10 md:pl-0">
          ← Back to Workspace
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings: {workspace.name}</h1>
      </div>

      <div className="border-b border-gray-200 dark:border-gray-800 mb-8">
        <nav className="flex gap-8" aria-label="Settings tabs">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => !tab.disabled && setActiveTab(tab.id)}
              disabled={tab.disabled}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : tab.disabled
                  ? "text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {saveSuccess && (
        <div className="mb-6 rounded-md bg-green-50 dark:bg-green-950 p-4 text-sm text-green-700 dark:text-green-300">
          Saved successfully!
        </div>
      )}

      {saveError && (
        <div className="mb-6 rounded-md bg-red-50 dark:bg-red-950 p-4 text-sm text-red-700 dark:text-red-300">
          {saveError}
        </div>
      )}

      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">General Settings</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Workspace Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  maxLength={100}
                />
              </div>
              <div>
                <label htmlFor="system_prompt" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  System Prompt
                </label>
                <textarea
                  id="system_prompt"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  rows={6}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">This prompt sets the AI&apos;s personality for all conversations in this workspace.</p>
              </div>
              <button
                onClick={handleGeneralSave}
                disabled={saving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "ai-provider" && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">AI Provider Configuration</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Configure the AI provider for this workspace. Only the workspace owner can change these settings.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="provider" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Provider
                </label>
                <select
                  id="provider"
                  value={provider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="groq">Groq</option>
                  <option value="openai">OpenAI</option>
                  <option value="together">Together AI</option>
                  <option value="fireworks">Fireworks AI</option>
                  <option value="cerebras">Cerebras</option>
                  <option value="custom">Custom</option>
                </select>
              </div>

              <div>
                <label htmlFor="baseUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Base URL
                </label>
                <input
                  id="baseUrl"
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="https://api.example.com/v1"
                />
              </div>

              <div>
                <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  API Key
                </label>
                <div className="mt-1 flex gap-2">
                  <input
                    id="apiKey"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={config?.llm_api_key_set ? "•••••••• (leave blank to keep current)" : "Enter your API key"}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="rounded-md border border-gray-300 dark:border-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    {showApiKey ? "Hide" : "Show"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {config?.llm_api_key_set
                    ? "API key is configured. Leave blank to keep the current key — Test Connection will use the saved key."
                    : "No API key configured."}
                </p>
              </div>

              <div>
                <label htmlFor="model" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Model
                </label>
                <input
                  id="model"
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="e.g., llama-3.3-70b-versatile"
                />
              </div>

              <div className="flex gap-4">
                <button
                  onClick={handleTestConnection}
                  disabled={
                    testingConnection ||
                    !baseUrl.trim() ||
                    (!apiKey.trim() && !config?.llm_api_key_set)
                  }
                  className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
                >
                  {testingConnection ? "Testing..." : "Test Connection"}
                </button>
                <button
                  onClick={handleProviderSave}
                  disabled={saving}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving..." : "Save Provider"}
                </button>
              </div>

              {testResult && (
                <div
                  className={`mt-4 rounded-md p-4 text-sm ${
                    testResult.success ? "bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300"
                  }`}
                >
                  {testResult.message}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === "members" && canManageMembers && (
        <div className="space-y-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Invitations</h2>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Share an invite link with new members. Links expire after 7 days.
                </p>
              </div>
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
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Members</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              {isOwner ? "Manage member roles, daily spending caps, and remove members. Only you can see today's AI usage." : "View members and update roles/caps."}
            </p>

            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Member</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Daily Cap</th>
                    {isOwner && (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Used Today</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Remaining</th>
                      </>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Joined</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {members.map((member) => (
                    <tr key={member.id}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{member.display_name}</div>
                          <div className="ml-3 text-sm text-gray-500 dark:text-gray-400">{member.email}</div>
                        </div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {editingMemberId === member.id ? (
                          <select
                            value={editRole}
                            onChange={(e) => setEditRole(e.target.value as "admin" | "member")}
                            disabled={!isOwner || member.user_id === workspace?.owner_id}
                            className="rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            {ROLE_OPTIONS.map((role) => (
                              <option key={role} value={role}>
                                {role.charAt(0).toUpperCase() + role.slice(1)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${roleBadge(member.role)}`}>
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {editingMemberId === member.id ? (
                          <input
                            type="number"
                            value={editCap}
                            onChange={(e) => setEditCap(parseInt(e.target.value) || 0)}
                            min={0}
                            step={100}
                            className="w-24 rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="text-sm text-gray-900 dark:text-gray-100">{formatCap(member.daily_cap_cents)}</span>
                        )}
                      </td>
                      {isOwner && (
                        <>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {memberUsage[member.id] ? formatCap(memberUsage[member.id].used_cents) : "—"}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100">
                            {memberUsage[member.id] ? formatCap(memberUsage[member.id].remaining_cents) : "—"}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {formatDate(member.joined_at)}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {editingMemberId === member.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={saveMemberEdit}
                              className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingMemberId(null)}
                              className="rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {canManageMembers && member.role !== "owner" && member.id !== workspace?.current_user_membership?.id && (
                              <button
                                onClick={() => startEditMember(member)}
                                className="rounded-md border border-gray-300 dark:border-gray-700 px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                Edit
                              </button>
                            )}
                            {isOwner && member.role !== "owner" && member.user_id !== workspace?.owner_id && (
                              <button
                                onClick={() => removeMember(member.id)}
                                className="rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "danger-zone" && isOwner && (
        <div className="space-y-6">
          <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-4">Danger Zone</h2>
            <p className="text-sm text-red-700 dark:text-red-300 mb-6">
              Once you delete this workspace, there is no going back. All messages, members, and settings will be permanently deleted.
            </p>

            <div className="space-y-4">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={confirmDelete}
                  onChange={(e) => setConfirmDelete(e.target.checked)}
                  className="rounded border-gray-300 dark:border-gray-700 text-red-600 dark:text-red-400 focus:ring-red-500"
                />
                <span className="text-sm text-red-700 dark:text-red-300">I understand this action is irreversible</span>
              </label>

              <button
                onClick={handleDeleteWorkspace}
                disabled={!confirmDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Delete Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "ai-provider" && !canManageProvider && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm text-center">
          <p className="text-gray-500 dark:text-gray-400">Only the workspace owner can configure the AI provider.</p>
        </div>
      )}

      {activeTab === "members" && !canManageMembers && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm text-center">
          <p className="text-gray-500 dark:text-gray-400">Only owners and admins can manage members.</p>
        </div>
      )}

      {activeTab === "danger-zone" && !isOwner && (
        <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-6 shadow-sm text-center">
          <p className="text-gray-500 dark:text-gray-400">Only the workspace owner can access the danger zone.</p>
        </div>
      )}
    </div>
  );
}