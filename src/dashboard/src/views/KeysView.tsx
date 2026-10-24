import React, { useState, useEffect } from 'react';
import { Key, Plus, Copy, Check, AlertTriangle, RefreshCw } from 'lucide-react';
import { ApiService, ApiKeyRecord, User } from '../api';

interface KeysViewProps {
  currentUser: User | null;
}

export const KeysView: React.FC<KeysViewProps> = ({ currentUser }) => {
  const [keys, setKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generatedSecret, setGeneratedSecret] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getKeys();
      setKeys(data);
    } catch (err: any) {
      console.error('Failed to load keys:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKeys();
  }, [currentUser]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;

    try {
      const resp = await ApiService.createKey(newKeyName.trim());
      setGeneratedSecret(resp.apiKey);
      await loadKeys();
    } catch (err: any) {
      alert(`Key generation failed: ${err.message}`);
    }
  };

  const handleRevoke = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to revoke API key '${name}'? This action is immediate and cannot be undone.`)) return;

    try {
      setRevokingId(id);
      await ApiService.revokeKey(id);
      await loadKeys();
    } catch (err: any) {
      alert(`Revocation failed: ${err.message}`);
    } finally {
      setRevokingId(null);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            API Key Management
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Generate and revoke personal API keys for MCP clients (Claude Desktop, MCP Inspector, etc.)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadKeys} className="btn btn-secondary">
            <RefreshCw size={15} />
            Refresh
          </button>
          <button onClick={() => { setShowGenerateModal(true); setGeneratedSecret(null); setNewKeyName(''); }} className="btn btn-primary">
            <Plus size={16} />
            Generate New Key
          </button>
        </div>
      </div>

      {/* Keys Table Container */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px' }} />
            <div>Loading active API keys...</div>
          </div>
        ) : keys.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Key size={36} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>No API keys yet</h3>
            <p style={{ fontSize: '13px' }}>Generate a key to connect Claude or other external MCP clients to this gateway.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Name</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Key Prefix</th>
                {currentUser?.role === 'admin' && (
                  <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>User</th>
                )}
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Created</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }}>
                  <td style={{ padding: '14px 20px', fontWeight: 500, color: '#f8fafc' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Key size={14} color="var(--primary)" />
                      {k.name}
                    </div>
                  </td>
                  <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', color: '#cbd5e1' }}>
                    {k.key_prefix}
                  </td>
                  {currentUser?.role === 'admin' && (
                    <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                      {k.user_email}
                    </td>
                  )}
                  <td style={{ padding: '14px 20px', color: 'var(--text-dim)' }}>
                    {new Date(k.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    {k.revoked_at ? (
                      <span className="badge badge-error">
                        Revoked
                      </span>
                    ) : (
                      <span className="badge badge-success">
                        Active
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    {!k.revoked_at && (
                      <button
                        onClick={() => handleRevoke(k.id, k.name)}
                        className="btn btn-danger btn-sm"
                        disabled={revokingId === k.id}
                      >
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Generate Key Modal */}
      {showGenerateModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '24px' }}>
            
            {!generatedSecret ? (
              <>
                <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Generate Personal API Key</h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Provide a descriptive name to identify the client or application that will use this key.
                </p>

                <form onSubmit={handleGenerate} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Key Name</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Claude Desktop Workstation"
                      className="input"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                    <button type="button" onClick={() => setShowGenerateModal(false)} className="btn btn-secondary">
                      Cancel
                    </button>
                    <button type="submit" className="btn btn-primary">
                      Generate Key
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--emerald)', marginBottom: '12px' }}>
                  <Check size={20} />
                  <h3 style={{ fontSize: '18px', fontWeight: 600, color: 'var(--text-main)' }}>Key Generated Successfully</h3>
                </div>

                <div style={{ background: 'var(--amber-bg)', border: '1px solid var(--amber-border)', padding: '12px 14px', borderRadius: '10px', color: 'var(--amber)', fontSize: '13px', lineHeight: '1.5', display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '16px' }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <div>
                    <strong>Copy this key now!</strong> For your security, this key is stored as a SHA-256 hash in PostgreSQL and will never be shown again.
                  </div>
                </div>

                <div style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid var(--border-medium)', borderRadius: '10px', padding: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '16px' }}>
                  <code style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: '#818cf8', wordBreak: 'break-all' }}>
                    {generatedSecret}
                  </code>
                  <button onClick={() => handleCopy(generatedSecret)} className="btn btn-secondary btn-sm" style={{ flexShrink: 0 }}>
                    {copied ? <Check size={14} color="var(--emerald)" /> : <Copy size={14} />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={() => setShowGenerateModal(false)} className="btn btn-primary">
                    Done
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
};
