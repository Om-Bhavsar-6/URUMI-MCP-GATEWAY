import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { ChatView } from './views/ChatView';
import { ServersView } from './views/ServersView';
import { KeysView } from './views/KeysView';
import { AuditLogsView } from './views/AuditLogsView';
import { ApiService, User } from './api';

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<'chat' | 'servers' | 'keys' | 'audit'>('chat');
  const [currentUser, setCurrentUser] = useState<User | null>(ApiService.getUser());
  const [initLoading, setInitLoading] = useState(true);

  // Initialize with Alice Admin by default for instant evaluation
  useEffect(() => {
    const initAuth = async () => {
      if (!ApiService.getToken()) {
        try {
          const auth = await ApiService.login('alice@example.com', 'AliceAdmin123!');
          setCurrentUser(auth.user);
        } catch (err) {
          console.error('Initial login failed:', err);
        }
      }
      setInitLoading(false);
    };
    initAuth();
  }, []);

  const handleSwitchUser = async (email: string) => {
    try {
      const password = email === 'alice@example.com' ? 'AliceAdmin123!' : 'BobMember123!';
      const auth = await ApiService.login(email, password);
      setCurrentUser(auth.user);
    } catch (err: any) {
      alert(`User switch failed: ${err.message}`);
    }
  };

  if (initLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px' }}>
        <div style={{ width: '40px', height: '40px', border: '3px solid rgba(99, 102, 241, 0.2)', borderTopColor: '#6366f1', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        <div style={{ color: 'var(--text-muted)', fontSize: '14px' }}>Connecting to Urumi MCP Gateway...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        currentUser={currentUser}
        onSwitchUser={handleSwitchUser}
      />

      <main style={{ flex: 1, padding: '24px' }}>
        {currentTab === 'chat' && <ChatView />}
        {currentTab === 'servers' && <ServersView currentUser={currentUser} />}
        {currentTab === 'keys' && <KeysView currentUser={currentUser} />}
        {currentTab === 'audit' && <AuditLogsView />}
      </main>
    </div>
  );
};
export default App;
