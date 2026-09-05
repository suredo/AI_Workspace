-- Create users table
create table users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255) unique not null,
  password_hash varchar(255) not null,
  display_name varchar(100) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS
alter table users enable row level security;
