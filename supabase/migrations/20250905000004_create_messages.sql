-- Create messages table
create table messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  sender_id uuid references users(id) on delete set null,
  role varchar(20) not null,
  content text not null,
  model varchar(50),
  cost_cents integer,
  created_at timestamptz not null default now()
);

-- Enable RLS
alter table messages enable row level security;

-- Indexes
create index idx_messages_workspace_created on messages(workspace_id, created_at);
