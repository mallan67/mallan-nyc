// app/client-access/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';

type Role = 'user' | 'assistant' | 'system';
type Msg = { role: Role; content: string };

export default function ClientAccessPage() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: 'assistant',
      content:
        'Hi! Ask about a NYC address (e.g., "300 E 90th St Manhattan"). I will pull DOB violations & permits and summarize.',
    },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const r = await fetch('/api/ai/nyc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // IMPORTANT: we hit the new NYC-intel endpoint and pass both the query and chat history
        body: JSON.stringify({ query: text, messages: next }),
      });

      const data = await r.json();
      if (!r.ok) throw new Error(data?.error || r.statusText);

      const reply: Msg = { role: 'assistant', content: data?.text ?? 'No reply.' };
      setMessages((prev) => [...prev, reply]);
    } catch (e: any) {
      const msg = e?.message || 'Request failed';
      setError(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: `(Error) ${msg}` }]);
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <main style={styles.main}>
      <div style={styles.card}>
        <h1 style={{ margin: 0 }}>Client Access (NYC Intel Demo)</h1>
        <p style={{ marginTop: 8, opacity: 0.7 }}>
          Ask about any NYC address. I’ll look up DOB violations & permits and summarize.
        </p>

        <div ref={listRef} style={styles.feed}>
          {messages.map((m, i) => (
            <div key={i} style={{ ...styles.msg, background: m.role === 'user' ? '#eef6ff' : '#f7f7f9' }}>
              <strong style={{ marginRight: 6 }}>{m.role === 'user' ? 'You' : 'Agent'}:</strong>
              <span>{m.content}</span>
            </div>
          ))}
        </div>

        <div style={styles.row}>
          <input
            style={styles.input}
            placeholder='e.g. 300 E 90th St Manhattan'
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            disabled={loading}
          />
          <button style={styles.btn} onClick={send} disabled={loading || !input.trim()}>
            {loading ? 'Thinking…' : 'Send'}
          </button>
        </div>

        {error && (
          <div style={{ marginTop: 8, color: '#b00020' }}>
            <small>Error: {error}</small>
          </div>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  main: {
    minHeight: '100svh',
    display: 'grid',
    placeItems: 'center',
    background: '#fafafa',
    padding: 20,
  },
  card: {
    width: 'min(900px, 100%)',
    background: '#fff',
    border: '1px solid #e7e7ea',
    borderRadius: 12,
    padding: 20,
    boxShadow: '0 6px 24px rgba(0,0,0,0.06)',
  },
  feed: {
    marginTop: 12,
    padding: 12,
    border: '1px solid #eee',
    borderRadius: 10,
    height: 380,
    overflowY: 'auto',
    background: '#fff',
  },
  msg: {
    padding: '10px 12px',
    borderRadius: 8,
    marginBottom: 10,
    lineHeight: 1.35,
    whiteSpace: 'pre-wrap',
  },
  row: {
    marginTop: 12,
    display: 'flex',
    gap: 8,
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    borderRadius: 8,
    border: '1px solid #dcdce0',
    outline: 'none',
  },
  btn: {
    padding: '12px 16px',
    borderRadius: 8,
    border: '1px solid #111',
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
  },
};
