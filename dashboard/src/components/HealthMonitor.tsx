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

  const workersAi = health?.checks.aiProviders.workersAi;

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

        {/* AI Provider (Cloudflare Workers AI Sole Provider) */}
        <div className="card">
          <div className="card-title">
            <span>AI Engine (Workers AI)</span>
            <Cpu size={18} color="var(--accent-purple)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', flexWrap: 'wrap' }}>
            <span
              className={`badge ${
                workersAi?.status === 'configured' ? 'badge-blue' : 'badge-amber'
              }`}
            >
              Workers AI (Sole): {workersAi?.status === 'configured' ? 'ACTIVE &amp; READY' : 'BINDING MISSING'}
            </span>
          </div>
          <div className="card-subtitle">
            Model: {workersAi?.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast'}
          </div>
        </div>

        {/* Telegram Bot API */}
        <div className="card">
          <div className="card-title">
            <span>Telegram Bot (@{health?.checks.telegram.botUsername || overview?.botUsername || 'ppiyushhhhBot'})</span>
            <Send size={18} color="var(--accent-blue)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px' }}>
            <span
              className={`badge ${
                health?.checks.telegram.status === 'configured' ? 'badge-green' : 'badge-red'
              }`}
            >
              {health?.checks.telegram.status === 'configured' ? 'CONNECTED / SECURED' : 'NOT CONFIGURED'}
            </span>
          </div>
          <div className="card-subtitle">
            Protected via secret token &bull; Authorized Telegram ID: 9084869490
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
              <span>AI Token Usage &amp; Cost</span>
              <Cpu size={16} />
            </div>
            <div className="card-value">{overview.usage?.totalTokens?.toLocaleString() || 0} tokens</div>
            <div className="card-subtitle">
              ${(overview.usage?.totalCostUsd || 0).toFixed(5)} total compute cost
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
