// app/style-preview/page.tsx
'use client';
import { useState } from 'react';

function Minimal() {
  const [q, setQ] = useState('');
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Option 1 — Modern Minimal (Clean, Boxy)</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Enter address, neighborhood, or building…"
          style={{ flex: 1, padding: '14px 16px', border: '1px solid #ccc', borderRadius: 4, background: '#fafafa' }}
        />
        <button
          style={{ padding: '14px 20px', borderRadius: 4, border: 'none', background: '#111', color: '#fff' }}
        >
          Search
        </button>
      </div>
    </section>
  );
}

function Luxury() {
  const [q, setQ] = useState('');
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Option 2 — Luxury (High-End Brokerage)</h3>
      <div style={{ display: 'flex', gap: 0, borderRadius: 50, overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.15)' }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search luxury homes…"
          style={{ flex: 1, padding: '16px 20px', border: 'none', outline: 'none', fontSize: 16 }}
        />
        <button
          style={{ padding: '16px 24px', border: 'none', background: '#000', color: '#f5d76e', fontWeight: 600, fontSize: 16 }}
        >
          Go
        </button>
      </div>
    </section>
  );
}

function UrbanTech() {
  const [q, setQ] = useState('');
  return (
    <section style={{ border: '1px solid #eee', borderRadius: 12, padding: 16 }}>
      <h3 style={{ marginTop: 0 }}>Option 3 — Urban Tech (StreetEasy-but-better)</h3>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search NYC real estate…"
          style={{ flex: 1, padding: '14px 16px', border: '2px solid #0070f3', borderRadius: 8, fontSize: 15 }}
        />
        <button
          style={{ padding: '14px 18px', borderRadius: 8, border: 'none', background: '#0070f3', color: '#fff', fontWeight: 600 }}
        >
          Search
        </button>
      </div>
    </section>
  );
}

export default function StylePreviewPage() {
  return (
    <main style={{ maxWidth: 1000, margin: '0 auto', padding: 24, display: 'grid', gap: 18 }}>
      <h1 style={{ margin: 0, fontSize: 28, fontWeight: 700 }}>Search Bar Style Preview</h1>
      <p style={{ marginTop: 0, opacity: 0.75 }}>
        Static UI previews only — no API calls and no changes to your live homepage.
      </p>
      <Minimal />
      <Luxury />
      <UrbanTech />
    </main>
  );
}
