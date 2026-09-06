-- Add LLM configuration columns to workspaces table
-- Allows workspace owners to configure their own AI provider

ALTER TABLE workspaces
  ADD COLUMN llm_provider text NOT NULL DEFAULT 'groq',
  ADD COLUMN llm_base_url text NOT NULL DEFAULT 'https://api.groq.com/openai/v1',
  ADD COLUMN llm_api_key_encrypted text,
  ADD COLUMN llm_model text NOT NULL DEFAULT 'llama-3.3-70b-versatile';
