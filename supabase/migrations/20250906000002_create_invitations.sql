-- Create invitations table for workspace member invites
create table invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token uuid not null default gen_random_uuid() unique,
  created_by uuid not null references users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  accepted_at timestamptz
);

-- Index for token lookups
create index idx_invitations_token on invitations(token);

-- Index for workspace lookups
create index idx_invitations_workspace_id on invitations(workspace_id);

-- Enable RLS
alter table invitations enable row level security;
