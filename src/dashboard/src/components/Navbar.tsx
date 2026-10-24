import React from 'react';
import { MessageSquare, Server, Key, Shield, ExternalLink, UserCheck } from 'lucide-react';
import { User } from '../api';

interface NavbarProps {
  currentTab: 'chat' | 'servers' | 'keys' | 'audit';
  onSelectTab: (tab: 'chat' | 'servers' | 'keys' | 'audit') => void;
  currentUser: User | null;
  onSwitchUser: (email: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentTab,
  onSelectTab,
  currentUser,
  onSwitchUser,
}) => {
  return (
    <header className="glass-header" style={{ position: 'sticky', top: 0, zIndex: 50, padding: '12px 24px' }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px' }}>
        
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ 
            width: '38px', 
            height: '38px', 
            borderRadius: '10px', 
            background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 15px rgba(99, 102, 241, 0.5)'
          }}>
            <Server size={20} color="#fff" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '18px', letterSpacing: '-0.5px' }}>
                URUMI
              </span>
              <span style={{ fontSize: '11px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
                GATEWAY
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-dim)', fontWeight: 400 }}>
              Team MCP Control Plane
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(15, 23, 42, 0.6)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)' }}>
          <button
            onClick={() => onSelectTab('chat')}
            className={`btn ${currentTab === 'chat' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', border: 'none' }}
          >
            <MessageSquare size={16} />
            Chat Agent
          </button>
          
          <button
            onClick={() => onSelectTab('servers')}
            className={`btn ${currentTab === 'servers' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', border: 'none' }}
          >
            <Server size={16} />
            MCP Upstreams
          </button>

          <button
            onClick={() => onSelectTab('keys')}
            className={`btn ${currentTab === 'keys' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', border: 'none' }}
          >
            <Key size={16} />
            API Keys
          </button>

          <button
            onClick={() => onSelectTab('audit')}
            className={`btn ${currentTab === 'audit' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ borderRadius: '8px', border: 'none' }}
          >
            <Shield size={16} />
            Audit Logs
          </button>
        </nav>

        {/* User Switcher & External Store Link */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          
          <a
            href="http://store.127.0.0.1.nip.io"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary btn-sm"
            style={{ textDecoration: 'none', gap: '6px', fontSize: '12px' }}
          >
            Storefront
            <ExternalLink size={13} color="var(--text-dim)" />
          </a>

          {/* User selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(255, 255, 255, 0.04)', padding: '6px 12px', borderRadius: '10px', border: '1px solid var(--border-subtle)' }}>
            <UserCheck size={16} color="var(--emerald)" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
              <div style={{ fontSize: '12px', fontWeight: 600 }}>
                {currentUser?.name || 'Logged Out'}
              </div>
              <div style={{ fontSize: '10px', color: currentUser?.role === 'admin' ? '#818cf8' : '#38bdf8', fontWeight: 600, textTransform: 'uppercase' }}>
                {currentUser?.role}
              </div>
            </div>

            <select
              style={{
                background: 'rgba(15, 23, 42, 0.8)',
                color: 'var(--text-main)',
                border: '1px solid var(--border-medium)',
                borderRadius: '6px',
                padding: '4px 6px',
                fontSize: '11px',
                cursor: 'pointer',
                outline: 'none',
              }}
              value={currentUser?.email || ''}
              onChange={(e) => onSwitchUser(e.target.value)}
            >
              <option value="alice@example.com">Alice (Admin)</option>
              <option value="bob@example.com">Bob (Member)</option>
            </select>
          </div>

        </div>

      </div>
    </header>
  );
};
