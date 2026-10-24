import React, { useState, useEffect } from 'react';
import { Server, Plus, ToggleLeft, ToggleRight, Trash2, Wrench, RefreshCw, ShieldAlert } from 'lucide-react';
import { ApiService, ServerRecord, User } from '../api';

interface ServersViewProps {
  currentUser: User | null;
}

export const ServersView: React.FC<ServersViewProps> = ({ currentUser }) => {
  const [servers, setServers] = useState<ServerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedServerTools, setSelectedServerTools] = useState<{ serverName: string; tools: any[] } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newServer, setNewServer] = useState({ name: '', url: '', bearer_token: '' });
  const [addError, setAddError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const isAdmin = currentUser?.role === 'admin';

  const loadServers = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getServers();
      setServers(data);
    } catch (err: any) {
      console.error('Failed to load servers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadServers();
  }, []);

  const handleToggle = async (server: ServerRecord) => {
    if (!isAdmin) return;
    try {
      setActionLoading(server.id);
      await ApiService.toggleServer(server.id);
      await loadServers();
    } catch (err: any) {
      alert(`Toggle failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!isAdmin) return;
    if (!confirm(`Are you sure you want to remove the upstream server '${name}'?`)) return;
    try {
      setActionLoading(id);
      await ApiService.deleteServer(id);
      await loadServers();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewTools = async (server: ServerRecord) => {
    try {
      const tools = await ApiService.getServerTools(server.id);
      setSelectedServerTools({ serverName: server.name, tools });
    } catch (err: any) {
      alert(`Failed to fetch tools: ${err.message}`);
    }
  };

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddError(null);
    try {
      await ApiService.addServer(newServer);
      setShowAddModal(false);
      setNewServer({ name: '', url: '', bearer_token: '' });
      await loadServers();
    } catch (err: any) {
      setAddError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            Upstream MCP Servers
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Registered Streamable HTTP MCP backends aggregated behind the Gateway.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={loadServers} className="btn btn-secondary">
            <RefreshCw size={15} />
            Refresh
          </button>
          {isAdmin && (
            <button onClick={() => setShowAddModal(true)} className="btn btn-primary">
              <Plus size={16} />
              Add Server
            </button>
          )}
        </div>
      </div>

      {/* Grid of Servers */}
      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ marginBottom: '10px' }} />
          <div>Checking upstream server health...</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '20px' }}>
          {servers.map((s) => (
            <div key={s.id} className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Card Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: s.status === 'connected' ? 'rgba(16, 185, 129, 0.15)' : s.status === 'disabled' ? 'rgba(148, 163, 184, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <Server size={18} color={s.status === 'connected' ? 'var(--emerald)' : s.status === 'disabled' ? 'var(--text-dim)' : 'var(--rose)'} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 600 }}>{s.name}</h3>
                    <div style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>ID: {s.id}</div>
                  </div>
                </div>

                {/* Status Badge */}
                <div className={`badge badge-${s.status}`}>
                  <span className={`pulse-indicator pulse-${s.status}`} />
                  {s.status}
                </div>
              </div>

              {/* Endpoint URL */}
              <div style={{ background: 'rgba(0, 0, 0, 0.25)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '3px' }}>Cluster Endpoint:</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: '#cbd5e1', wordBreak: 'break-all' }}>
                  {s.url}
                </div>
              </div>

              {/* Error message if unreachable */}
              {s.error && (
                <div style={{ background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--rose-border)', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: 'var(--rose)' }}>
                  ⚠️ {s.error}
                </div>
              )}

              {/* Card Footer */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: '10px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>{s.toolCount}</span> tools exposed
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button onClick={() => handleViewTools(s)} className="btn btn-secondary btn-sm" disabled={s.toolCount === 0}>
                    <Wrench size={13} />
                    Tools
                  </button>

                  {isAdmin && (
                    <>
                      <button
                        onClick={() => handleToggle(s)}
                        className="btn btn-secondary btn-sm"
                        title={s.enabled ? 'Disable Server' : 'Enable Server'}
                        disabled={actionLoading === s.id}
                      >
                        {s.enabled ? <ToggleRight size={18} color="var(--emerald)" /> : <ToggleLeft size={18} color="var(--text-dim)" />}
                      </button>

                      <button
                        onClick={() => handleDelete(s.id, s.name)}
                        className="btn btn-danger btn-sm"
                        title="Remove Server"
                        disabled={actionLoading === s.id}
                      >
                        <Trash2 size={13} />
                      </button>
                    </>
                  )}
                </div>
              </div>

            </div>
          ))}
        </div>
      )}

      {/* Tools Modal Drawer */}
      {selectedServerTools && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '650px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Wrench size={18} color="var(--primary)" />
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Tools: {selectedServerTools.serverName}</h3>
              </div>
              <button onClick={() => setSelectedServerTools(null)} className="btn btn-secondary btn-sm">Close</button>
            </div>

            <div style={{ padding: '20px 24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {selectedServerTools.tools.map((t, idx) => (
                <div key={idx} style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid var(--border-subtle)', borderRadius: '10px', padding: '14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#a5b4fc', fontSize: '14px' }}>
                      {t.name}
                    </span>
                  </div>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '10px' }}>
                    {t.description}
                  </p>
                  <div style={{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>Input Schema:</div>
                  <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', background: 'rgba(0,0,0,0.4)', padding: '8px', borderRadius: '6px', color: '#94a3b8', overflowX: 'auto' }}>
                    {JSON.stringify(t.inputSchema, null, 2)}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Server Modal (with SSRF Guardrail feedback) */}
      {showAddModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '520px', padding: '24px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Register Upstream MCP Server</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
              Register a cluster-internal Streamable HTTP MCP service. SSRF guardrails prevent connecting to cloud metadata or loopback addresses.
            </p>

            {addError && (
              <div style={{ background: 'rgba(244, 63, 94, 0.15)', border: '1px solid var(--rose-border)', padding: '10px 14px', borderRadius: '8px', color: 'var(--rose)', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <ShieldAlert size={16} />
                {addError}
              </div>
            )}

            <form onSubmit={handleAddServer} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Server Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. inventory-mcp"
                  className="input"
                  value={newServer.name}
                  onChange={(e) => setNewServer({ ...newServer, name: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Streamable HTTP URL</label>
                <input
                  type="url"
                  required
                  placeholder="http://inventory-mcp.urumi-gateway.svc.cluster.local:3005/mcp"
                  className="input"
                  value={newServer.url}
                  onChange={(e) => setNewServer({ ...newServer, url: e.target.value })}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Internal Bearer Token (Optional)</label>
                <input
                  type="password"
                  placeholder="Bearer token kept strictly server-side"
                  className="input"
                  value={newServer.bearer_token}
                  onChange={(e) => setNewServer({ ...newServer, bearer_token: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setShowAddModal(false)} className="btn btn-secondary">
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Register Upstream
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
