-- Create workspaces table
create table workspaces (
  id uuid primary key default gen_random_uuid(),
  name varchar(100) not null,
  owner_id uuid not null references users(id) on delete cascade,
  system_prompt text not null default 'You are a helpful AI assistant. This conversation is shared among members of a study group. Be concise, educational, and collaborative.',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table workspaces enable row level security;
