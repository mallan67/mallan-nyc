// app/client-access/page.tsx
'use client';

import React, { useState } from 'react';

type Role = 'user' | 'assistant' | 'system';
type Msg = { role: Role; content: string };

export default function ClientAccess() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi! Ask me something about real estate.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    // Push the user message using a functional update and literal role
    setMessages(prev => [...prev, { role: 'user' as const, content: text }]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, { role: 'user' as const, content: text }] }),
      });
      const data = await res.json();
      const replyText = (data?.text ?? '— no reply —').toString();

      // Push assistant message with literal role
      setMessages(prev => [...prev, { role: 'assistant' as const, content: replyText }]);
    } catch (e: any) {
      setMessages(prev => [...prev, { role: 'assistant' as const, content: `(error: ${e?.message || 'network'})` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Client Access (Demo Chat)</h1>

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            background: m.role === 'user' ? '#eef6ff' : '#f7f7f7',
            border: '1px solid #e5e5e5',
            borderRadius: 8,
            padding: 12,
          }}>
            <strong style={{ marginRight: 6 }}>{m.role}:</strong>
            <span>{m.content}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8 }}
        />
        <button onClick={send} disabled={loading || !input.trim()} style={{ padding: '10px 16px', borderRadius: 8 }}>
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </main>
  );
}
