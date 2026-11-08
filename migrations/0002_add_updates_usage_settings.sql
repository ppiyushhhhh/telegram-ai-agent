-- Migration: 0002_add_updates_usage_settings.sql
-- Adds processed_updates, ai_usage, and system_settings tables

-- 1. Table for duplicate update prevention (idempotency by Telegram update_id)
CREATE TABLE IF NOT EXISTS processed_updates (
  update_id INTEGER PRIMARY KEY,
  chat_id INTEGER,
  user_id INTEGER,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_processed_updates_user ON processed_updates(user_id);
CREATE INDEX IF NOT EXISTS idx_processed_updates_time ON processed_updates(processed_at);

-- 2. Table for tracking AI token usage & estimated API cost per interaction
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  conversation_id TEXT,
  provider TEXT NOT NULL DEFAULT 'openai',
  model TEXT NOT NULL,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0.0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_conv ON ai_usage(conversation_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);

-- 3. System settings table for configurable dynamic parameters
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default system settings
INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
  ('default_model', 'gpt-4o-mini', 'Default primary OpenAI model'),
  ('default_temperature', '0.7', 'Default temperature for responses'),
  ('max_tokens', '1000', 'Maximum response tokens'),
  ('allowlist_enforced', 'true', 'Whether Telegram numeric ID allowlist is strictly enforced');

