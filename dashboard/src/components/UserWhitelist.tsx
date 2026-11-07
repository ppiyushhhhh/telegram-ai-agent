import React, { useState } from 'react';
import { UserCheck, UserX, Shield, Search } from 'lucide-react';
import type { AdminUser } from '../services/api';

interface UserWhitelistProps {
  users: AdminUser[];
  onAllowUser: (id: number) => Promise<void>;
  onDenyUser: (id: number) => Promise<void>;
}

export const UserWhitelist: React.FC<UserWhitelistProps> = ({ users, onAllowUser, onDenyUser }) => {
  const [filter, setFilter] = useState('');
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const filteredUsers = users.filter((u) => {
    const q = filter.toLowerCase();
    return (
      u.first_name.toLowerCase().includes(q) ||
      (u.last_name && u.last_name.toLowerCase().includes(q)) ||
      (u.username && u.username.toLowerCase().includes(q)) ||
      String(u.id).includes(q)
    );
  });

  const handleToggle = async (user: AdminUser) => {
    setLoadingId(user.id);
    try {
      if (user.is_allowed) {
        await onDenyUser(user.id);
      } else {
        await onAllowUser(user.id);
      }
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="card">
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Telegram Access Whitelist</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Only allowed users can interact with your private AI Agent.
          </p>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-sm)',
            padding: '6px 12px'
          }}
        >
          <Search size={14} color="var(--text-secondary)" />
          <input
            type="text"
            placeholder="Search by name, @username, or ID..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontSize: '0.8125rem',
              width: '220px'
            }}
          />
        </div>
      </div>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Telegram ID</th>
              <th>Full Name</th>
              <th>Username</th>
              <th>Status</th>
              <th>Last Active</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '32px' }}>
                  No users recorded in database yet.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => (
                <tr key={user.id}>
                  <td>
                    <code style={{ fontSize: '0.8125rem', color: 'var(--accent-blue)' }}>{user.id}</code>
                  </td>
                  <td>
                    {user.first_name} {user.last_name || ''}
                  </td>
                  <td>
                    {user.username ? (
                      <span style={{ color: 'var(--accent-purple)' }}>@{user.username}</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>None</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${user.is_allowed ? 'badge-green' : 'badge-red'}`}>
                      {user.is_allowed ? (
                        <>
                          <UserCheck size={12} />
                          <span>ALLOWED</span>
                        </>
                      ) : (
                        <>
                          <UserX size={12} />
                          <span>BLOCKED</span>
                        </>
                      )}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem' }}>
                    {new Date(user.updated_at).toLocaleString()}
                  </td>
                  <td>
                    <button
                      className={`btn ${user.is_allowed ? 'btn-danger' : 'btn-success'}`}
                      onClick={() => handleToggle(user)}
                      disabled={loadingId === user.id}
                      style={{ padding: '6px 10px', fontSize: '0.75rem' }}
                    >
                      {user.is_allowed ? (
                        <>
                          <UserX size={13} />
                          <span>Revoke Access</span>
                        </>
                      ) : (
                        <>
                          <Shield size={13} />
                          <span>Grant Access</span>
                        </>
                      )}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
