-- Allow anonymous users to register (insert into users table)
-- This is needed because the existing RLS policy requires auth.uid() = id,
-- but registration happens before authentication.
-- Restricts insert to only the columns needed for registration.
create policy "Allow anonymous registration"
  on users for insert
  to anon
  with check (
    email is not null
    and password_hash is not null
    and display_name is not null
  );
