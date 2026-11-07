export interface DbUser {
  id: number;
  first_name: string;
  last_name?: string | null;
  username?: string | null;
  is_allowed: number;
  created_at: string;
  updated_at: string;
}

export interface DbConversation {
  id: string;
  telegram_chat_id: number;
  user_id: number;
  model: string;
  system_prompt?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbMessage {
  id: string;
  conversation_id: string;
  telegram_message_id?: number | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  tokens_used: number;
  created_at: string;
}

export interface DbAuditLog {
  id: string;
  event_type: string;
  user_id?: number | null;
  chat_id?: number | null;
  payload?: string | null;
  created_at: string;
}
