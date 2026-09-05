-- RLS Policies for AI Workspace

-- ============================================
-- Users table policies
-- ============================================

-- Users can read their own profile
create policy "Users can read own profile"
  on users for select
  using (auth.uid() = id);

-- Users can update their own profile
create policy "Users can update own profile"
  on users for update
  using (auth.uid() = id);

-- ============================================
-- Workspaces table policies
-- ============================================

-- Members can read their workspaces
create policy "Members can read workspaces"
  on workspaces for select
  using (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = workspaces.id
      and workspace_members.user_id = auth.uid()
    )
  );

-- Authenticated users can create workspaces
create policy "Authenticated users can create workspaces"
  on workspaces for insert
  with check (auth.uid() = owner_id);

-- Only owners can update workspace settings
create policy "Owners can update workspaces"
  on workspaces for update
  using (auth.uid() = owner_id);

-- Only owners can delete (archive) workspaces
create policy "Owners can delete workspaces"
  on workspaces for delete
  using (auth.uid() = owner_id);

-- ============================================
-- Workspace members table policies
-- ============================================

-- Members can read other members in their workspaces
create policy "Members can read workspace members"
  on workspace_members for select
  using (
    exists (
      select 1 from workspace_members as wm
      where wm.workspace_id = workspace_members.workspace_id
      and wm.user_id = auth.uid()
    )
  );

-- Workspace owners can add members
create policy "Owners can add members"
  on workspace_members for insert
  with check (
    exists (
      select 1 from workspaces
      where workspaces.id = workspace_members.workspace_id
      and workspaces.owner_id = auth.uid()
    )
  );

-- Workspace owners can update member roles and caps
create policy "Owners can update members"
  on workspace_members for update
  using (
    exists (
      select 1 from workspaces
      where workspaces.id = workspace_members.workspace_id
      and workspaces.owner_id = auth.uid()
    )
  );

-- Workspace owners can remove members
create policy "Owners can remove members"
  on workspace_members for delete
  using (
    exists (
      select 1 from workspaces
      where workspaces.id = workspace_members.workspace_id
      and workspaces.owner_id = auth.uid()
    )
  );

-- ============================================
-- Messages table policies
-- ============================================

-- Members can read messages in their workspaces
create policy "Members can read workspace messages"
  on messages for select
  using (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = messages.workspace_id
      and workspace_members.user_id = auth.uid()
    )
  );

-- Members can send messages in their workspaces
create policy "Members can send messages"
  on messages for insert
  with check (
    exists (
      select 1 from workspace_members
      where workspace_members.workspace_id = messages.workspace_id
      and workspace_members.user_id = auth.uid()
    )
    and auth.uid() = sender_id
  );
