import React, { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Users, MessageSquare, ShieldAlert, Cpu } from 'lucide-react';
import {
  api,
  DEFAULT_ADMIN_KEY,
  type HealthStatus,
  type SystemOverview,
  type AdminUser,
  type AdminConversation,
  type AdminAuditLog
} from './services/api';
import { Header } from './components/Header';
import { HealthMonitor } from './components/HealthMonitor';
import { UserWhitelist } from './components/UserWhitelist';
import { ConversationList } from './components/ConversationList';
import { AuditLogView } from './components/AuditLogView';
import { AiMemorySettings } from './components/AiMemorySettings';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'whitelist' | 'conversations' | 'logs' | 'ai'>('overview');
  const [adminKey, setAdminKey] = useState<string>(() => localStorage.getItem('tg_admin_key') || DEFAULT_ADMIN_KEY);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [overview, setOverview] = useState<SystemOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [conversations, setConversations] = useState<AdminConversation[]>([]);
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);

  const handleAdminKeyChange = (key: string) => {
    setAdminKey(key);
    localStorage.setItem('tg_admin_key', key);
    api.setAdminKey(key);
  };

  const loadData = useCallback(async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    api.setAdminKey(adminKey);

    try {
      // Health endpoint doesn't require admin key
      const healthData = await api.getHealth().catch((err) => {
        console.warn('Health check fetch failed:', err);
        return null;
      });
      if (healthData) setHealth(healthData);

      // Authenticated endpoints require admin key
      if (adminKey) {
        try {
          const [overviewData, usersData, convsData, logsData] = await Promise.all([
            api.getOverview(),
            api.getUsers(),
            api.getConversations(),
            api.getLogs()
          ]);
          setOverview(overviewData);
          setUsers(usersData);
          setConversations(convsData);
          setLogs(logsData);
        } catch (authErr) {
          if (authErr instanceof Error) {
            setErrorMessage(authErr.message);
          }
        }
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [adminKey]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [loadData]);

  const handleAllowUser = async (userId: number) => {
    await api.allowUser(userId);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_allowed: 1 } : u)));
  };

  const handleDenyUser = async (userId: number) => {
    await api.denyUser(userId);
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, is_allowed: 0 } : u)));
  };

  const handleSelectConversation = async (id: string) => {
    return api.getMessages(id);
  };

  return (
    <div className="app-container">
      <Header
        adminKey={adminKey}
        onAdminKeyChange={handleAdminKeyChange}
        environment={health?.environment || 'development'}
        onRefresh={loadData}
        isRefreshing={isRefreshing}
      />

      <main className="main-content">
        {errorMessage && (
          <div
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#f87171',
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              marginBottom: '20px',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <span>⚠️ {errorMessage} (Make sure your Admin API Key is set in the header)</span>
            <button
              onClick={() => setErrorMessage(null)}
              style={{ background: 'transparent', color: '#f87171', fontWeight: 700 }}
            >
              ✕
            </button>
          </div>
        )}

        <nav className="tabs-nav">
          <button
            className={`tab-btn ${activeTab === 'overview' ? 'active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <LayoutDashboard size={16} />
            <span>Overview &amp; Health</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'whitelist' ? 'active' : ''}`}
            onClick={() => setActiveTab('whitelist')}
          >
            <Users size={16} />
            <span>User Whitelist ({users.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'conversations' ? 'active' : ''}`}
            onClick={() => setActiveTab('conversations')}
          >
            <MessageSquare size={16} />
            <span>Conversations ({conversations.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveTab('logs')}
          >
            <ShieldAlert size={16} />
            <span>Security Logs ({logs.length})</span>
          </button>
          <button
            className={`tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
            onClick={() => setActiveTab('ai')}
          >
            <Cpu size={16} />
            <span>AI &amp; Memory</span>
          </button>
        </nav>

        {activeTab === 'overview' && <HealthMonitor health={health} overview={overview} />}
        {activeTab === 'whitelist' && (
          <UserWhitelist users={users} onAllowUser={handleAllowUser} onDenyUser={handleDenyUser} />
        )}
        {activeTab === 'conversations' && (
          <ConversationList
            conversations={conversations}
            onSelectConversation={handleSelectConversation}
          />
        )}
        {activeTab === 'logs' && <AuditLogView logs={logs} />}
        {activeTab === 'ai' && <AiMemorySettings health={health} />}
      </main>
    </div>
  );
};
