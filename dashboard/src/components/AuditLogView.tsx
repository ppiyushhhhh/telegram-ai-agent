import React from 'react';
import { ShieldAlert, CheckCircle, Info } from 'lucide-react';
import type { AdminAuditLog } from '../services/api';

interface AuditLogViewProps {
  logs: AdminAuditLog[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ logs }) => {
  return (
    <div className="card">
      <div style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Security &amp; Audit Logs</h2>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
          Detailed record of webhook attempts, whitelist updates, and security events.
        </p>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Timestamp</th>
              <th>Event Type</th>
              <th>User ID</th>
              <th>Chat ID</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                  No security events recorded in D1 yet.
                </td>
              </tr>
            ) : (
              logs.map((log) => {
                const isUnauthorized = log.event_type.includes('UNAUTHORIZED');
                const isAdmin = log.event_type.includes('ADMIN');

                return (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          isUnauthorized ? 'badge-red' : isAdmin ? 'badge-blue' : 'badge-green'
                        }`}
                      >
                        {isUnauthorized ? (
                          <ShieldAlert size={12} />
                        ) : isAdmin ? (
                          <Info size={12} />
                        ) : (
                          <CheckCircle size={12} />
                        )}
                        <span>{log.event_type}</span>
                      </span>
                    </td>
                    <td>
                      {log.user_id ? (
                        <code style={{ color: 'var(--accent-blue)' }}>{log.user_id}</code>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      )}
                    </td>
                    <td>
                      {log.chat_id ? (
                        <code>{log.chat_id}</code>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>N/A</span>
                      )}
                    </td>
                    <td style={{ maxWidth: '300px', wordBreak: 'break-word', fontSize: '0.8125rem' }}>
                      {log.payload ? (
                        <pre
                          style={{
                            background: 'var(--bg-card)',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            whiteSpace: 'pre-wrap'
                          }}
                        >
                          {log.payload}
                        </pre>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>-</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
