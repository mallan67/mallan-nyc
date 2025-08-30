'use client';

import { useState } from 'react';

type Role = 'user' | 'assistant' | 'system';
type Msg = { role: Role; content: string };

export default function ClientAccessPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    // keep role as a literal type
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });
      const data = await res.json();
      const reply = (data?.text as string) ?? '— no reply —';
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 12 }}>Client Access (Demo Chat)</h1>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '10px 12px', border: '1px solid #ccc', borderRadius: 8 }}
        />
        <button
          onClick={send}
          disabled={loading}
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            border: '1px solid #000',
            background: loading ? '#888' : '#000',
            color: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              background: m.role === 'user' ? '#eef6ff' : '#f7f7f7',
              border: '1px solid #e5e5e5',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <strong style={{ marginRight: 6 }}>{m.role}:</strong>
            <span>{m.content}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
