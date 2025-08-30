// app/client-access/page.tsx
'use client';

import { useState } from 'react';

type Role = 'user' | 'assistant' | 'system';
type Msg = { role: Role; content: string };

export default function ClientAccess() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    // messages typed as Msg[], role uses the union type
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? `HTTP ${res.status}`);
      } else {
        const assistant: Msg = { role: 'assistant', content: (data?.text ?? '').toString() };
        setMessages([...next, assistant]);
      }
    } catch (err: any) {
      setError(err?.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>Client Access (Demo Chat)</h1>

      <div style={{ display: 'grid', gap: 12, margin: '16px 0' }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              background: m.role === 'user' ? '#eef5ff' : '#f6f6f6',
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <strong style={{ marginRight: 8 }}>{m.role}:</strong>
            <span>{m.content}</span>
          </div>
        ))}
        {error && <div style={{ color: '#b91c1c' }}>Error: {error}</div>}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          style={{ flex: 1, padding: '12px 14px', border: '1px solid #d1d5db', borderRadius: 8 }}
        />
        <button
          disabled={loading || !input.trim()}
          style={{
            padding: '12px 16px',
            borderRadius: 8,
            border: '1px solid #111827',
            background: '#111827',
            color: '#fff',
          }}
        >
          {loading ? 'Sending…' : 'Send'}
        </button>
      </form>
    </main>
  );
}
