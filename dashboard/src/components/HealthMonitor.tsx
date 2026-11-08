import React from 'react';
import { Database, Cpu, Send, ShieldCheck, Clock, MessageSquare, Users } from 'lucide-react';
import type { HealthStatus, SystemOverview } from '../services/api';

interface HealthMonitorProps {
  health: HealthStatus | null;
  overview: SystemOverview | null;
}

export const HealthMonitor: React.FC<HealthMonitorProps> = ({ health, overview }) => {
  const isHealthy = health?.status === 'healthy';
  const isDegraded = health?.status === 'degraded';

  const formatUptime = (seconds?: number) => {
    if (!seconds) return '0s';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  return (
    <div>
      <div className="grid-cards">
        {/* Overall System Health */}
        <div className="card">
          <div className="card-title">
            <span>Edge System Health</span>
            <ShieldCheck size={18} color="var(--accent-blue)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <span
              className={`badge ${
                isHealthy ? 'badge-green' : isDegraded ? 'badge-amber' : 'badge-red'
              }`}
            >
              {(health?.status || 'Unknown').toUpperCase()}
            </span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              v{health?.version || '0.1.0'}
            </span>
          </div>
          <div className="card-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Clock size={12} />
            <span>Uptime: {formatUptime(health?.uptimeSeconds)}</span>
          </div>
        </div>

        {/* Cloudflare D1 Database */}
        <div className="card">
          <div className="card-title">
            <span>Cloudflare D1 Database</span>
            <Database size={18} color="var(--accent-green)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <span
              className={`badge ${
                health?.checks.database.status === 'ok' ? 'badge-green' : 'badge-red'
              }`}
            >
              {health?.checks.database.status === 'ok' ? 'ONLINE' : 'OFFLINE'}
            </span>
            {health?.checks.database.latencyMs !== undefined && (
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                {health.checks.database.latencyMs}ms ping
              </span>
            )}
          </div>
          <div className="card-subtitle">
            Binding: DB ({overview?.stats.totalMessages || 0} messages stored)
          </div>
        </div>

        {/* AI Providers (Gemini Primary, Workers AI Secondary, OpenAI Optional) */}
        <div className="card">
          <div className="card-title">
            <span>AI Engine ({health?.checks.aiProviders.primary === 'workers-ai' ? 'Workers AI' : health?.checks.aiProviders.primary === 'openai' ? 'OpenAI' : 'Gemini'})</span>
            <Cpu size={18} color="var(--accent-purple)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            <span
              className={`badge ${
                health?.checks.aiProviders.gemini?.status === 'configured' ? 'badge-green' : 'badge-red'
              }`}
            >
              Gemini (Primary): {health?.checks.aiProviders.gemini?.status === 'configured' ? 'READY' : 'MISSING KEY'}
            </span>
            <span
              className={`badge ${
                health?.checks.aiProviders.workersAi?.status === 'configured' ? 'badge-blue' : 'badge-amber'
              }`}
            >
              Workers AI (Secondary): {health?.checks.aiProviders.workersAi?.status === 'configured' ? 'READY' : 'OFF'}
            </span>
            <span
              className={`badge ${
                health?.checks.aiProviders.openai?.status === 'configured' ? 'badge-green' : 'badge-amber'
              }`}
            >
              OpenAI (Optional): {health?.checks.aiProviders.openai?.status === 'configured' ? 'READY' : 'UNCONFIGURED'}
            </span>
          </div>
          <div className="card-subtitle">
            Primary: {health?.checks.aiProviders.gemini?.model || 'gemini-3.8-flash'} &bull; Secondary: {health?.checks.aiProviders.workersAi?.model || '@cf/meta/llama-3.3-70b-instruct'}
          </div>
        </div>

        {/* Telegram Bot API */}
        <div className="card">
          <div className="card-title">
            <span>Telegram Webhook</span>
            <Send size={18} color="var(--accent-blue)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <span
              className={`badge ${
                health?.checks.telegram.status === 'configured' ? 'badge-green' : 'badge-amber'
              }`}
            >
              {health?.checks.telegram.status === 'configured' ? 'SECURED' : 'UNCONFIGURED'}
            </span>
          </div>
          <div className="card-subtitle">
            Protected with secret token header verification
          </div>
        </div>
      </div>

      {/* Aggregate Metrics Bar */}
      {overview && (
        <div className="grid-cards" style={{ marginBottom: '24px' }}>
          <div className="card" style={{ padding: '16px 20px' }}>
            <div className="card-title">
              <span>Total Interacted Users</span>
              <Users size={16} />
            </div>
            <div className="card-value">{overview.stats.totalUsers}</div>
            <div className="card-subtitle">
              {overview.stats.allowedUsers} whitelisted ({overview.stats.totalUsers - overview.stats.allowedUsers} blocked)
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div className="card-title">
              <span>Active Conversations</span>
              <MessageSquare size={16} />
            </div>
            <div className="card-value">{overview.stats.totalConversations}</div>
            <div className="card-subtitle">
              {overview.stats.totalMessages} total message exchanges
            </div>
          </div>

          <div className="card" style={{ padding: '16px 20px' }}>
            <div className="card-title">
              <span>Security &amp; Audit Events</span>
              <ShieldCheck size={16} />
            </div>
            <div className="card-value">{overview.stats.totalAuditLogs}</div>
            <div className="card-subtitle">Access attempts &amp; policy logs recorded</div>
          </div>
        </div>
      )}
    </div>
  );
};
