import React, { useState } from 'react';
import { Bell, Clock, CheckCircle2, Trash2 } from 'lucide-react';
import type { AdminReminder } from '../services/api';

interface ReminderListProps {
  reminders: AdminReminder[];
  onDeleteReminder: (id: string) => Promise<void>;
}

export const ReminderList: React.FC<ReminderListProps> = ({ reminders, onDeleteReminder }) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'sent'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filteredReminders = reminders.filter((r) => {
    if (filter === 'pending') return r.is_sent === 0;
    if (filter === 'sent') return r.is_sent === 1;
    return true;
  });

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this reminder?')) {
      setDeletingId(id);
      try {
        await onDeleteReminder(id);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const pendingCount = reminders.filter((r) => r.is_sent === 0).length;
  const sentCount = reminders.filter((r) => r.is_sent === 1).length;

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Bell size={20} color="var(--accent-blue)" /> Scheduled Reminders &amp; Cron Tasks
          </h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Proactive notifications scheduled via natural language prompts and processed by Cloudflare Cron Triggers (* * * * *).
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            className={`tab-button ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
            style={{ fontSize: '0.75rem', padding: '6px 12px' }}
          >
            All ({reminders.length})
          </button>
          <button
            className={`tab-button ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
            style={{ fontSize: '0.75rem', padding: '6px 12px' }}
          >
            Pending ({pendingCount})
          </button>
          <button
            className={`tab-button ${filter === 'sent' ? 'active' : ''}`}
            onClick={() => setFilter('sent')}
            style={{ fontSize: '0.75rem', padding: '6px 12px' }}
          >
            Dispatched ({sentCount})
          </button>
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Reminder Note</th>
              <th>Scheduled For</th>
              <th>User ID</th>
              <th>Dispatched At</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredReminders.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                  No {filter !== 'all' ? filter : ''} reminders found in D1.
                </td>
              </tr>
            ) : (
              filteredReminders.map((rem) => {
                const isSent = rem.is_sent === 1;
                const isDue = !isSent && new Date(rem.remind_at).getTime() <= Date.now();

                return (
                  <tr key={rem.id}>
                    <td>
                      <span className={`badge ${isSent ? 'badge-green' : isDue ? 'badge-yellow' : 'badge-blue'}`}>
                        {isSent ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                        <span>{isSent ? 'Dispatched' : isDue ? 'Due Now' : 'Pending'}</span>
                      </span>
                    </td>
                    <td style={{ fontWeight: 500, maxWidth: '280px', wordBreak: 'break-word' }}>
                      {rem.reminder_text}
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
                      {new Date(rem.remind_at).toLocaleString()}
                    </td>
                    <td>
                      <code style={{ color: 'var(--accent-blue)' }}>{rem.user_id}</code>
                    </td>
                    <td style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
                      {rem.sent_at ? new Date(rem.sent_at).toLocaleString() : '—'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleDelete(rem.id)}
                        disabled={deletingId === rem.id}
                        className="button-ghost"
                        style={{ color: 'var(--accent-red)', padding: '4px 8px' }}
                        title="Delete Reminder"
                      >
                        <Trash2 size={14} />
                      </button>
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

