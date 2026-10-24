import React, { useState, useEffect } from 'react';
import { Shield, Search, RefreshCw, Clock, CheckCircle2, XCircle, Code } from 'lucide-react';
import { ApiService, AuditLogRecord } from '../api';

export const AuditLogsView: React.FC = () => {
  const [logs, setLogs] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLogRecord | null>(null);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await ApiService.getAuditLogs({
        limit: 50,
        search: search.trim() || undefined,
        status: statusFilter || undefined,
      });
      setLogs(data.logs);
      setTotal(data.total);
    } catch (err: any) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, [statusFilter]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadLogs();
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 700, letterSpacing: '-0.5px' }}>
            Gateway Audit Trail
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginTop: '4px' }}>
            Comprehensive immutable log of every tool execution routed through the Gateway ({total} total events recorded).
          </p>
        </div>

        <button onClick={loadLogs} className="btn btn-secondary">
          <RefreshCw size={15} />
          Refresh Logs
        </button>
      </div>

      {/* Filter / Search Bar */}
      <div className="glass-panel" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '280px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search by user email, server name, or tool name..."
              className="input"
              style={{ paddingLeft: '38px', height: '40px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-secondary" style={{ height: '40px' }}>
            Search
          </button>
        </form>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input"
          style={{ width: '150px', height: '40px', background: 'rgba(15, 23, 42, 0.7)', cursor: 'pointer' }}
        >
          <option value="">All Statuses</option>
          <option value="success">Success Only</option>
          <option value="error">Error Only</option>
        </select>
      </div>

      {/* Logs Table */}
      <div className="glass-panel" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <RefreshCw size={24} className="spin" style={{ marginBottom: '10px' }} />
            <div>Querying audit log records...</div>
          </div>
        ) : logs.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Shield size={36} color="var(--text-dim)" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>No audit logs found</h3>
            <p style={{ fontSize: '13px' }}>Tool executions will appear here in real-time as users and clients invoke MCP tools.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', background: 'rgba(255, 255, 255, 0.02)' }}>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Timestamp</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>User</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Server</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Tool Executed</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Duration</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)' }}>Status</th>
                <th style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--text-muted)', textAlign: 'right' }}>Payload</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '14px 20px', color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>
                    {new Date(log.created_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'medium' })}
                  </td>
                  <td style={{ padding: '14px 20px', fontWeight: 500, color: '#f8fafc' }}>
                    {log.user_email || 'anonymous'}
                  </td>
                  <td style={{ padding: '14px 20px', color: 'var(--text-muted)' }}>
                    {log.server_name}
                  </td>
                  <td style={{ padding: '14px 20px', fontFamily: 'var(--font-mono)', color: '#818cf8', fontWeight: 500 }}>
                    {log.tool_name}
                  </td>
                  <td style={{ padding: '14px 20px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      {log.duration_ms} ms
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px' }}>
                    <span className={`badge badge-${log.status}`}>
                      {log.status === 'success' ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
                      {log.status}
                    </span>
                  </td>
                  <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                    <button onClick={() => setSelectedLog(log)} className="btn btn-secondary btn-sm">
                      <Code size={13} />
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Inspect Payload Modal */}
      {selectedLog && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-overlay)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
          <div className="glass-panel" style={{ width: '100%', maxWidth: '600px', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: 600 }}>Audit Event Details</h3>
                <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>ID: {selectedLog.id}</div>
              </div>
              <button onClick={() => setSelectedLog(null)} className="btn btn-secondary btn-sm">Close</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>Invocation Arguments:</div>
                <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'rgba(0,0,0,0.4)', padding: '12px', borderRadius: '8px', color: '#cbd5e1', overflowX: 'auto' }}>
                  {JSON.stringify(selectedLog.arguments, null, 2)}
                </pre>
              </div>

              {selectedLog.error_message && (
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--rose)', marginBottom: '4px' }}>Error Details:</div>
                  <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', background: 'rgba(244, 63, 94, 0.1)', border: '1px solid var(--rose-border)', padding: '12px', borderRadius: '8px', color: 'var(--rose)', overflowX: 'auto' }}>
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
