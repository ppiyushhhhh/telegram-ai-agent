-- Migration 0003: Add reminders table for scheduled proactive notifications
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  reminder_text TEXT NOT NULL,
  remind_at TEXT NOT NULL,
  is_sent INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(is_sent, remind_at);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
