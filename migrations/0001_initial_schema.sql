-- Migration: 0001_initial_schema.sql
-- Initial schema for Telegram AI Agent on Cloudflare D1

-- 1. Users table (Telegram users interacted with the bot)
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, -- Telegram User ID
  first_name TEXT NOT NULL,
  last_name TEXT,
  username TEXT,
  is_allowed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 2. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  telegram_chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  system_prompt TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 3. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  telegram_message_id INTEGER,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tokens_used INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
);

-- 4. Audit & Event Logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  user_id INTEGER,
  chat_id INTEGER,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_allowed ON users(is_allowed);
CREATE INDEX IF NOT EXISTS idx_conversations_chat ON conversations(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
