// app/page.tsx
'use client';
import { useEffect, useState } from 'react';

type Listing = {
  id: string;
  address: string;
  unit?: string;
  price?: number;
  rent?: number;
  type?: string;
  sqft?: number;
};
type SearchResponse = {
  scope: 'nyc' | 'national' | 'global';
  inventory_counts: Record<string, number>;
  items: Listing[];
};

export default function Home() {
  const [q, setQ] = useState('');
  const [scope, setScope] = useState<'nyc' | 'national' | 'global'>('nyc');
  const [data, setData] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // NEXT_PUBLIC_* is safe to read on the client
  const apiBase = (process.env.NEXT_PUBLIC_API_BASE ?? '').replace(/\/$/, '');

  useEffect(() => {
    if (!apiBase) return; // no external API configured
    const controller = new AbortController();

    setLoading(true);
    fetch(
      `${apiBase}/search?scope=${scope}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      { signal: controller.signal }
    )
      .then((r) => r.json())
      .then((res: SearchResponse) => setData(res))
      .catch(() => {}) // ignore aborted/other small errors
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [scope, q, apiBase]);

  const counts = data?.inventory_counts ?? { nyc: 1, national: 0, global: 0 };

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: '40px 20px' }}>
      {/* Hero Header */}
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>
        Mallan Real Estate — NYC
      </h1>
      <p style={{ opacity: 0.7, marginBottom: 24 }}>
        Fast NYC-first search. National and Global appear when listings exist.
      </p>

      {/* Search Bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by address, building, or neighborhood…"
          style={{
            flex: 1,
            padding: '12px 14px',
            border: '1px solid #ccc',
            borderRadius: 8,
          }}
        />
        <button
          onClick={() => setQ(q.trim())}
          style={{
            padding: '12px 18px',
            borderRadius: 8,
            border: '1px solid #000',
            background: '#000',
            color: '#fff',
          }}
        >
          Search
        </button>
      </div>

      {/* Scope Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        <button
          onClick={() => setScope('nyc')}
          style={{
            padding: '8px 12px',
            borderRadius: 8,
            border: '1px solid #ddd',
            background: scope === 'nyc' ? '#000' : '#fff',
            color: scope === 'nyc' ? '#fff' : '#000',
          }}
        >
          NYC ({counts.nyc})
        </button>

        {counts.national > 0 && (
          <button
            onClick={() => setScope('national')}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: scope === 'national' ? '#000' : '#fff',
              color: scope === 'national' ? '#fff' : '#000',
            }}
          >
            National ({counts.national})
          </button>
        )}

        {counts.global > 0 && (
          <button
            onClick={() => setScope('global')}
            style={{
              padding: '8px 12px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: scope === 'global' ? '#000' : '#fff',
              color: scope === 'global' ? '#fff' : '#000',
            }}
          >
            Global ({counts.global})
          </button>
        )}
      </div>

      {/* Results */}
      <div>
        {loading && <p>Loading…</p>}

        {!loading && data?.items?.length ? (
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'grid',
              gap: 12,
            }}
          >
            {data.items.map((item) => (
              <li
                key={item.id}
                style={{
                  border: '1px solid #eee',
                  borderRadius: 10,
                  padding: 12,
                }}
              >
                <div style={{ fontWeight: 600 }}>
                  {item.address}
                  {item.unit ? `, #${item.unit}` : ''}
                </div>
                <div style={{ opacity: 0.7 }}>
                  {item.type ?? 'Listing'} · {item.sqft ? `${item.sqft} sqft` : '—'} ·{' '}
                  {item.price
                    ? `$${item.price.toLocaleString()}`
                    : item.rent
                    ? `$${item.rent.toLocaleString()}/mo`
                    : 'Price on request'}
                </div>
              </li>
            ))}
          </ul>
        ) : !loading ? (
          <p>No results yet.</p>
        ) : null}
      </div>
    </main>
  );
}
