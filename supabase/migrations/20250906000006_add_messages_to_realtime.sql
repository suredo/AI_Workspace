-- Expose new message inserts to Supabase Realtime so chat clients can
-- subscribe instead of polling (see issue #96). Inserts only: the default
-- replica identity is sufficient, no UPDATE/DELETE payloads needed.
-- Guarded so the migration is safe to re-run.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;
END
$$;
