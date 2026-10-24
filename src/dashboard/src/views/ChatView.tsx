import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User as UserIcon, Wrench, ChevronDown, ChevronRight, Clock, Sparkles } from 'lucide-react';
import { ApiService, ChatMessage } from '../api';

export const ChatView: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'msg-welcome',
      role: 'assistant',
      content: `👋 Welcome! I am your **Team MCP Store & Operations Assistant**.\n\nAll tools I execute are proxied securely through the single **Urumi MCP Gateway** endpoint, with every invocation audited and attributed to your user account.`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const toggleToolExpand = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const handleSend = async (textToSend?: string) => {
    const promptText = (textToSend || input).trim();
    if (!promptText || loading) return;

    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: promptText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const history = messages
        .filter((m) => m.id !== 'msg-welcome')
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await ApiService.sendChatMessage(promptText, history);

      const assistantMsg: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: 'assistant',
        content: resp.reply,
        toolCalls: resp.toolCalls,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `⚠️ Error communicating with Gateway: ${err.message}`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const suggestions = [
    'Show me the store products',
    'Create product "Wireless Keyboard" for $79.99',
    'Show recent orders',
    'Weather forecast for Bengaluru',
    'Calculate shipping rate to IN for 2.5 kg',
    'Show customer notes for alice@example.com',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 110px)', maxWidth: '1000px', margin: '0 auto', gap: '16px' }}>
      
      {/* Suggestions Bar */}
      <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
        {suggestions.map((s, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(s)}
            className="btn btn-secondary btn-sm"
            style={{ whiteSpace: 'nowrap', borderRadius: 'var(--radius-full)', fontSize: '12px', background: 'rgba(255, 255, 255, 0.04)' }}
          >
            <Sparkles size={12} color="var(--primary)" />
            {s}
          </button>
        ))}
      </div>

      {/* Messages Container */}
      <div className="glass-panel" style={{ flex: 1, overflowY: 'auto', padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              display: 'flex',
              gap: '12px',
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
            }}
          >
            {/* Avatar */}
            {msg.role === 'assistant' && (
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px',
                boxShadow: '0 0 10px rgba(99, 102, 241, 0.4)'
              }}>
                <Bot size={18} color="#fff" />
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              
              {/* Message Bubble */}
              <div
                style={{
                  padding: '14px 18px',
                  borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                  background: msg.role === 'user' ? 'linear-gradient(135deg, #4f46e5 0%, #4338ca 100%)' : 'rgba(255, 255, 255, 0.05)',
                  border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                  color: '#fff',
                  fontSize: '14px',
                  lineHeight: '1.6',
                  whiteSpace: 'pre-line',
                }}
              >
                {msg.content}
              </div>

              {/* Tool Execution Cards */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                  {msg.toolCalls.map((tc, idx) => {
                    const toolKey = `${msg.id}-tool-${idx}`;
                    const isExpanded = expandedTools[toolKey];
                    return (
                      <div
                        key={idx}
                        style={{
                          background: 'rgba(15, 23, 42, 0.8)',
                          border: '1px solid rgba(99, 102, 241, 0.25)',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          fontSize: '12px',
                        }}
                      >
                        <button
                          onClick={() => toggleToolExpand(toolKey)}
                          style={{
                            width: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-main)',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Wrench size={14} color="var(--primary)" />
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, color: '#a5b4fc' }}>
                              {tc.tool}
                            </span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-dim)' }}>
                              <Clock size={12} />
                              {tc.durationMs}ms
                            </span>
                            <span className="badge badge-success" style={{ fontSize: '10px', padding: '2px 6px' }}>
                              Executed
                            </span>
                            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                          </div>
                        </button>

                        {isExpanded && (
                          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(0, 0, 0, 0.3)' }}>
                            <div style={{ marginBottom: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>Arguments:</div>
                            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#cbd5e1', overflowX: 'auto', marginBottom: '8px' }}>
                              {JSON.stringify(tc.args, null, 2)}
                            </pre>

                            <div style={{ marginBottom: '6px', color: 'var(--text-muted)', fontWeight: 600 }}>Upstream Result:</div>
                            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: '#a7f3d0', overflowX: 'auto', maxHeight: '180px' }}>
                              {JSON.stringify(tc.result, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Timestamp */}
              <div style={{ fontSize: '11px', color: 'var(--text-dim)', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                {msg.timestamp}
              </div>
            </div>

            {/* User Avatar */}
            {msg.role === 'user' && (
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '10px',
                background: 'rgba(255, 255, 255, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginTop: '2px'
              }}>
                <UserIcon size={18} color="#cbd5e1" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #6366f1 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Bot size={18} color="#fff" />
            </div>
            <div style={{ padding: '12px 18px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="pulse-indicator pulse-connected" />
              <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Routing tool call through Team Gateway...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
        style={{ display: 'flex', gap: '10px' }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question or instruct an action (e.g., 'List products', 'Create a product for $49', 'Get weather for Tokyo')..."
          className="input"
          style={{ height: '48px', fontSize: '14px', borderRadius: '14px', paddingLeft: '18px' }}
          disabled={loading}
        />
        <button
          type="submit"
          className="btn btn-primary"
          style={{ height: '48px', padding: '0 24px', borderRadius: '14px' }}
          disabled={loading || !input.trim()}
        >
          <Send size={16} />
          Send
        </button>
      </form>

    </div>
  );
};
