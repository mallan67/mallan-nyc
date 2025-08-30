'use client';
import { useState } from 'react';
type Msg = { role: 'user' | 'assistant' | 'system'; content: string };

export default function ClientAccess() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi! Ask me something about real estate.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const next = [...messages, { role: 'user', content: text }];
    setMessages(next); setInput(''); setLoading(true);
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next })
      });
      const data = await res.json();
      setMessages([...next, { role: 'assistant', content: data.text || `(error: ${data.error || 'no reply'})` }]);
    } catch {
      setMessages([...next, { role: 'assistant', content: '(network error)' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 700, margin: '0 auto', padding: '32px 20px' }}>
      <h1 style={{ marginBottom: 12 }}>Client Access</h1>
      <div style={{ border: '1px solid #eee', borderRadius: 10, padding: 12, minHeight: 220, marginBottom: 12 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ margin: '8px 0' }}>
            <strong>{m.role === 'user' ? 'You' : 'Agent'}:</strong> {m.content}
          </div>
        ))}
        {loading && <div>Thinking…</div>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Type your message…"
          style={{ flex: 1, padding: '12px 14px', border: '1px solid #ccc', borderRadius: 8 }}
        />
        <button onClick={send} disabled={loading} style={{ padding: '12px 16px', borderRadius: 8 }}>
          Send
        </button>
      </div>
    </main>
  );
}
