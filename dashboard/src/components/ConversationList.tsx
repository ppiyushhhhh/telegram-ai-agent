import React, { useState } from 'react';
import { MessageSquare, Bot, User, Clock } from 'lucide-react';
import type { AdminConversation, AdminMessage } from '../services/api';

interface ConversationListProps {
  conversations: AdminConversation[];
  onSelectConversation: (id: string) => Promise<AdminMessage[]>;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  conversations,
  onSelectConversation
}) => {
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);

  const handleSelect = async (id: string) => {
    setSelectedConvId(id);
    setIsLoadingMessages(true);
    try {
      const msgs = await onSelectConversation(id);
      setMessages(msgs);
    } finally {
      setIsLoadingMessages(false);
    }
  };

  return (
    <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(280px, 1fr) 2fr',
          minHeight: '520px'
        }}
      >
        {/* Conversations Column */}
        <div
          style={{
            borderRight: '1px solid var(--border-color)',
            background: 'var(--bg-secondary)',
            padding: '16px',
            overflowY: 'auto',
            maxHeight: '600px'
          }}
        >
          <h2 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '12px' }}>
            Conversations ({conversations.length})
          </h2>

          {conversations.length === 0 ? (
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '24px' }}>
              No active conversations in D1 yet.
            </p>
          ) : (
            conversations.map((conv) => {
              const isSelected = selectedConvId === conv.id;
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelect(conv.id)}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '8px',
                    background: isSelected ? 'var(--bg-card-hover)' : 'var(--bg-card)',
                    border: isSelected ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>
                      Chat #{conv.telegram_chat_id}
                    </span>
                    <span className="badge badge-blue" style={{ fontSize: '0.7rem' }}>
                      {conv.model}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginTop: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <Clock size={11} />
                    <span>{new Date(conv.updated_at).toLocaleString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Message Thread Column */}
        <div
          style={{
            padding: '20px',
            background: 'var(--bg-primary)',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '600px',
            overflowY: 'auto'
          }}
        >
          {!selectedConvId ? (
            <div
              style={{
                margin: 'auto',
                textAlign: 'center',
                color: 'var(--text-muted)'
              }}
            >
              <MessageSquare size={36} style={{ marginBottom: '8px', opacity: 0.5 }} />
              <p>Select a conversation from the left to view message history.</p>
            </div>
          ) : isLoadingMessages ? (
            <div style={{ margin: 'auto', color: 'var(--text-muted)' }}>Loading messages...</div>
          ) : messages.length === 0 ? (
            <div style={{ margin: 'auto', color: 'var(--text-muted)' }}>
              No messages found for this conversation.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.map((msg) => {
                const isUser = msg.role === 'user';
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignSelf: isUser ? 'flex-end' : 'flex-start',
                      maxWidth: '80%'
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        marginBottom: '4px',
                        fontSize: '0.75rem',
                        color: 'var(--text-secondary)'
                      }}
                    >
                      {isUser ? <User size={12} /> : <Bot size={12} color="var(--accent-blue)" />}
                      <span style={{ fontWeight: 600 }}>{isUser ? 'User' : 'Assistant (AI)'}</span>
                      <span style={{ color: 'var(--text-muted)' }}>
                        {new Date(msg.created_at).toLocaleTimeString()}
                      </span>
                    </div>

                    <div
                      style={{
                        padding: '12px 16px',
                        borderRadius: 'var(--radius-md)',
                        background: isUser ? 'var(--accent-blue)' : 'var(--bg-card)',
                        color: isUser ? 'white' : 'var(--text-primary)',
                        fontSize: '0.875rem',
                        lineHeight: 1.5,
                        whiteSpace: 'pre-wrap',
                        border: isUser ? 'none' : '1px solid var(--border-color)'
                      }}
                    >
                      {msg.content}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
