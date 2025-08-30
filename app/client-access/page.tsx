// app/client-access/page.tsx
'use client';

import { useState, useRef } from 'react';

type Role = 'user' | 'assistant' | 'system';
type Msg = { role: Role; content: string };

export default function ClientAccess() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hi! Ask me something about real estate.' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Scroll to latest message
  const scrollToEnd = () => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    });
  };

  async function send() {
    const text = input.trim();
    if (!text || loading) return;

    // Build next message list and update state with correct types
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setLoading(true);
    scrollToEnd();

    try {
      // If user typed something that looks like an address, you could choose /api/ai/nyc.
      // For now keep it simple and always hit /api/ai (your working endpoint).
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
      });

      const data = await res.json().catch(() => null);
      const reply: string =
        (data && (data.text || data.answer || data.message)) || 'Sorry—no reply.';

      setMessages([...next, { role: 'assistant', content: reply }]);
      scrollToEnd();
    } catch (e) {
      setMessages([
        ...next,
        {
          role: 'assistant',
          content:
            'Hmm, I hit an error talking to the server. Try again, or ping me if it keeps happening.',
        },
      ]);
    } finally {
      setLoading(false);
      scrollToEnd();
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      send();
    }
  }

  return (
    <main style={styles.wrap}>
      <h1 style={styles.title}>Client Access (Demo Chat)</h1>

      {/* Input row */}
      <div style={styles.inputRow}>
        <input
          placeholder="Type a message…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKey}
          style={styles.input}
          aria-label="Message"
        />
        <button onClick={send} disabled={loading} style={styles.button}>
          {loading ? 'Sending…' : 'Send'}
        </button>
      </div>

      {/* Messages */}
      <div ref={listRef} style={styles.list}>
        {messages.map((m, i) => (
          <div key={i} style={m.role === 'user' ? styles.rowRight : styles.rowLeft}>
            <div
              style={{
                ...(m.role === 'user' ? styles.bubbleUser : styles.bubbleAssistant),
              }}
            >
              <div style={styles.roleLabel}>{m.role}:</div>
              <div>{m.content}</div>
            </div>
          </div>
        ))}

        {loading && (
          <div style={styles.rowLeft}>
            <div style={styles.bubbleAssistant}>
              <div style={styles.roleLabel}>assistant:</div>
              <div>…</div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

/* ===== inline “demo” styles ===== */
const styles: Record<string, React.CSSProperties> = {
  wrap: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '40px 20px',
    fontFamily:
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji"',
  },
  title: { fontSize: 32, fontWeight: 700, marginBottom: 16 },
  inputRow: {
    display: 'flex',
    gap: 8,
    marginBottom: 16,
  },
  input: {
    flex: 1,
    padding: '12px 14px',
    border: '1px solid #ddd',
    borderRadius: 10,
    fontSize: 16,
    outline: 'none',
  },
  button: {
    padding: '12px 18px',
    borderRadius: 10,
    border: '1px solid #000',
    background: '#000',
    color: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    maxHeight: 520,
    overflowY: 'auto',
    border: '1px solid #eee',
    borderRadius: 12,
    padding: 16,
    background: '#fafafa',
  },
  rowLeft: { display: 'flex', justifyContent: 'flex-start' },
  rowRight: { display: 'flex', justifyContent: 'flex-end' },
  bubbleAssistant: {
    maxWidth: '75%',
    background: '#fff',
    border: '1px solid #e6e6e6',
    borderRadius: 14,
    padding: '10px 12px',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  bubbleUser: {
    maxWidth: '75%',
    background: '#0f172a',
    color: '#fff',
    borderRadius: 14,
    padding: '10px 12px',
  },
  roleLabel: {
    opacity: 0.55,
    fontSize: 12,
    marginBottom: 4,
    textTransform: 'lowercase',
  },
};
