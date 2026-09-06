-- Allow anonymous users to register (insert into users table)
-- This is needed because the existing RLS policy requires auth.uid() = id,
-- but registration happens before authentication.
create policy "Allow anonymous registration"
  on users for insert
  to anon
  with check (true);
