export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  system_prompt: string;
  created_at: string;
  updated_at: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  daily_cap_cents: number;
  joined_at: string;
}

export interface WorkspaceWithMembers extends Workspace {
  workspace_members: WorkspaceMember[];
  member_count: number;
}

export interface Invitation {
  id: string;
  workspace_id: string;
  token: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  accepted_at: string | null;
}

export interface InvitationWithDetails extends Invitation {
  workspace_name: string;
  created_by_name: string;
}

export interface Message {
  id: string;
  workspace_id: string;
  sender_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  model: string | null;
  cost_cents: number | null;
  created_at: string;
}

export interface MessageWithSender extends Message {
  display_name: string;
}

export interface WorkspaceConfig {
  llm_provider: string;
  llm_base_url: string;
  llm_api_key_set: boolean;
  llm_model: string;
}

export interface WorkspaceWithConfig extends Workspace {
  llm_provider: string;
  llm_base_url: string;
  llm_api_key_encrypted: string | null;
  llm_model: string;
}
