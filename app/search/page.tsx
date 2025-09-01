'use client';

import { useState } from 'react';

type ApiResponse = {
  ok: boolean;
  input?: string;
  bin?: string;
  geoclient?: any;
  sources?: {
    ecb_violations?: { ok: boolean; count: number; items: any[] };
  };
  ecb_open_count?: number;
  ecb_balance_due_total?: number;
};

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      // Call your aggregator and forward the "open only" choice
      const url = new URL('/api/ai/nyc', window.location.origin);
      if (openOnly) url.searchParams.set('open', '1');

      const r = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, ecbOpen: openOnly }),
      });

      const json = await r.json();
      setData(json);
    } catch (err: any) {
      setError(err?.message ?? String(err));
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const bin = data?.bin;
  const ecbCount =
    data?.ecb_open_count ?? data?.sources?.ecb_violations?.count ?? 0;
  const ecbBalance = data?.ecb_balance_due_total ?? 0;

  const bisUrl = bin
    ? `https://a810-bisweb.nyc.gov/BISWeb/PropertyProfileOverviewServlet?bin=${encodeURIComponent(
        bin
      )}`
    : null;

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">NYC Address Lookup</h1>

      <form onSubmit={onSubmit} className="space-y-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g., 300 East 90 Street Manhattan 10128"
          className="w-full border rounded px-3 py-2"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={openOnly}
            onChange={(e) => setOpenOnly(e.target.checked)}
          />
          Only show likely-open ECBs
        </label>
        <button
          disabled={loading}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && <p className="text-red-600">Error: {error}</p>}

      {data && (
        <section className="space-y-2">
          <h2 className="font-semibold">Result</h2>
          {bin && (
            <p>
              BIN: <span className="font-mono">{bin}</span>
            </p>
          )}
          {bisUrl && (
            <p>
              <a
                className="text-blue-600 underline"
                href={bisUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open DOB Property Profile ↗
              </a>
            </p>
          )}
          <p>Open ECB count: {ecbCount}</p>
          <p>Total ECB balance due: ${ecbBalance}</p>

          {/* Note: the raw JSON debug block has been removed on purpose. */}
        </section>
      )}
    </main>
  );
}
