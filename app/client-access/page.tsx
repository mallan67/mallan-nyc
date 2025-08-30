// app/client-access/page.tsx
'use client';

import { useState } from 'react';

type Role = 'user' | 'assistant' | 'system';
type Msg = { role: Role; content: string };

export default function ClientAccess() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hello! Ask me anything.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const r = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await r.json();
      const reply = (data?.text ?? '').toString().trim() || '(no reply)';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Request failed.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>
        Client Access (Demo Chat)
      </h1>

      <div style={{ display: 'grid', gap: 8, marginBottom: 16 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'end' : 'start',
              background: m.role === 'user' ? '#eef' : '#f6f6f6',
              border: '1px solid #ddd',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <strong>{m.role}</strong>: {m.content}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8 }}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid #000',
            background: '#000',
            color: '#fff',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>
    </main>
  );
}
