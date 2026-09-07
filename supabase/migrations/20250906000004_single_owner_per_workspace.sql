-- Enforce single owner per workspace at the database level
-- Application logic also restricts role assignment to admin/member only
CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_members_single_owner
  ON workspace_members (workspace_id)
  WHERE role = 'owner';
