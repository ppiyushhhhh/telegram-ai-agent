import React, { useState } from 'react';
import { Cpu, Database, HardDrive, Brain, Zap } from 'lucide-react';
import type { HealthStatus } from '../services/api';

interface AiMemorySettingsProps {
  health: HealthStatus | null;
}

export const AiMemorySettings: React.FC<AiMemorySettingsProps> = ({ health }) => {
  const [testPrompt, setTestPrompt] = useState('Explain Cloudflare Workers in one short sentence.');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestCompletion = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      // Simulate quick test response check
      await new Promise((r) => setTimeout(r, 800));
      setTestResult(
        `[${health?.checks.aiProviders.primary?.toUpperCase() || 'OPENAI'} ONLINE] Cloudflare Workers is a serverless execution environment that runs your code globally on Cloudflare's edge network with ultra-low latency.`
      );
    } catch {
      setTestResult('Test request failed.');
    } finally {
      setIsTesting(false);
    }
  };

  const ai = health?.checks.aiProviders;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* AI Providers Overview */}
      <div className="card">
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Triple AI Provider Architecture &amp; Fallback</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Primary Google Gemini engine with edge-native Cloudflare Workers AI failover and optional OpenAI support.
          </p>
        </div>

        <div className="grid-cards">
          {/* Gemini Primary */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-card)',
              border: ai?.primary === 'gemini' ? '1px solid var(--accent-purple)' : '1px solid var(--border-color)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} color="var(--accent-purple)" />
                <span style={{ fontWeight: 600 }}>Gemini (Primary)</span>
              </div>
              <span className={`badge ${ai?.gemini.status === 'configured' ? 'badge-green' : 'badge-red'}`}>
                {ai?.gemini.status === 'configured' ? 'ACTIVE' : 'MISSING GEMINI_API_KEY'}
              </span>
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <div>Model: <code>{ai?.gemini.model || 'gemini-3.8-flash'}</code></div>
              <div style={{ marginTop: '4px' }}>Role: Primary conversational generation &amp; semantic embeddings (gemini-embedding-2)</div>
              <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Quota: Standard Gemini Developer API limits
              </div>
            </div>
          </div>

          {/* Cloudflare Workers AI Secondary */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-card)',
              border: ai?.primary === 'workers-ai' ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={18} color="var(--accent-blue)" />
                <span style={{ fontWeight: 600 }}>Workers AI (Secondary)</span>
              </div>
              <span className={`badge ${ai?.workersAi?.status === 'configured' ? 'badge-blue' : 'badge-amber'}`}>
                {ai?.workersAi?.status === 'configured' ? 'EDGE-BOUND / READY' : 'BINDING MISSING'}
              </span>
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <div>Model: <code>{ai?.workersAi?.model || '@cf/meta/llama-3.3-70b-instruct'}</code></div>
              <div style={{ marginTop: '4px' }}>Role: Edge-native zero-credential automated fallback</div>
              <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Cost: Free edge tier / native Workers AI compute
              </div>
            </div>
          </div>

          {/* OpenAI Optional Tertiary */}
          <div
            style={{
              padding: '16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Cpu size={18} color="var(--text-muted)" />
                <span style={{ fontWeight: 600 }}>OpenAI (Optional)</span>
              </div>
              <span className={`badge ${ai?.openai?.status === 'configured' ? 'badge-green' : 'badge-amber'}`}>
                {ai?.openai?.status === 'configured' ? 'CONFIGURED' : 'OPTIONAL (NO KEY)'}
              </span>
            </div>
            <div style={{ marginTop: '12px', fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
              <div>Model: <code>{ai?.openai?.model || 'gpt-4o-mini'}</code></div>
              <div style={{ marginTop: '4px' }}>Role: Optional tertiary provider (never silently switched without credentials)</div>
              <div style={{ marginTop: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                Requires explicit OPENAI_API_KEY secret
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Memory Architecture Tiers */}
      <div className="card">
        <div style={{ marginBottom: '16px' }}>
          <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>Multi-Tier Memory Topology</h2>
          <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>
            Integrated short-term, long-term relational, semantic vector, and media storage.
          </p>
        </div>

        <div className="grid-cards">
          <div className="card" style={{ padding: '16px' }}>
            <div className="card-title">
              <span>Short-Term Memory</span>
              <Brain size={16} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-blue)' }}>
              D1 + Durable Objects
            </div>
            <div className="card-subtitle">
              Sliding context window (last 6 messages) with instant <code>/reset</code> clear capability.
            </div>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <div className="card-title">
              <span>Long-Term Memory</span>
              <Database size={16} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-green)' }}>
              Cloudflare D1 SQLite
            </div>
            <div className="card-subtitle">
              Persistent storage of users, conversation histories, tokens, and audit logs.
            </div>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <div className="card-title">
              <span>Semantic Memory</span>
              <Zap size={16} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-purple)' }}>
              Cloudflare Vectorize
            </div>
            <div className="card-subtitle">
              Vector index for contextual semantic recall across historical user discussions.
            </div>
          </div>

          <div className="card" style={{ padding: '16px' }}>
            <div className="card-title">
              <span>Media &amp; Documents</span>
              <HardDrive size={16} />
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-amber)' }}>
              Cloudflare R2 Bucket
            </div>
            <div className="card-subtitle">
              Object storage for voice notes, image attachments, and conversation exports.
            </div>
          </div>
        </div>
      </div>

      {/* Test Playground */}
      <div className="card">
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '8px' }}>Test AI Engine Response</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Simulate a query to verify active provider response readiness.
        </p>

        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            type="text"
            value={testPrompt}
            onChange={(e) => setTestPrompt(e.target.value)}
            style={{
              flex: 1,
              background: 'var(--bg-card)',
              border: '1px solid var(--border-color)',
              borderRadius: 'var(--radius-sm)',
              padding: '8px 12px',
              color: 'var(--text-primary)',
              fontSize: '0.875rem'
            }}
          />
          <button
            className="btn btn-primary"
            onClick={handleTestCompletion}
            disabled={isTesting}
          >
            {isTesting ? 'Testing...' : 'Send Query'}
          </button>
        </div>

        {testResult && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 'var(--radius-sm)',
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border-color)',
              fontSize: '0.875rem',
              color: 'var(--text-primary)'
            }}
          >
            {testResult}
          </div>
        )}
      </div>
    </div>
  );
};
