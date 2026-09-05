-- Create workspace_members table
create table workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role varchar(20) not null default 'member',
  daily_cap_cents integer not null default 500,
  joined_at timestamptz not null default now(),
  unique(workspace_id, user_id)
);

-- Enable RLS
alter table workspace_members enable row level security;
