-- Store reasoning-model thinking traces (e.g. <think> blocks) separately
-- from the visible answer so the UI can show them as collapsible.
ALTER TABLE messages
  ADD COLUMN reasoning text;
