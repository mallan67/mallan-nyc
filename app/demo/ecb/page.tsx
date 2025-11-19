'use client';

import React, { useState } from 'react';

type Item = {
  ecb_violation_number?: string;
  ecb_violation_status?: string;
  violation_type?: string;
  severity?: string;
  issue_date_iso?: string;
  balance_due?: string;
  links?: { explore?: string; json?: string };
};

export default function Page() {
  const [bin, setBin] = useState('1073503');
  const [openOnly, setOpenOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    setLoading(true);
    setError(null);
    setItems(null);
    try {
      const origin =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (typeof window !== 'undefined' ? window.location.origin : '');
      const url = new URL(`${origin}/api/dob/ecb-violations`);
      url.searchParams.set('bin', bin.trim());
      if (openOnly) url.searchParams.set('open', '1');
      const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const data = await res.json();
      setItems(Array.isArray(data?.items) ? data.items : []);
    } catch (e: any) {
      setError(e?.message || 'Unexpected error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-semibold">ECB Violations (demo)</h1>

      <div className="flex gap-2 items-end">
        <label className="flex-1">
          <div className="text-sm font-medium">BIN</div>
          <input
            value={bin}
            onChange={(e) => setBin(e.target.value)}
            className="w-full border rounded px-3 py-2"
            placeholder="e.g. 1073503"
          />
        </label>
        <label className="flex items-center gap-2 mb-2">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          <span>Open only</span>
        </label>
        <button
          onClick={search}
          className="px-4 py-2 rounded bg-black text-white hover:opacity-90"
          disabled={loading}
        >
          {loading ? 'Searching…' : 'Search'}
        </button>
      </div>

      {error && <div className="text-red-600">Error: {error}</div>}

      {!loading && items && (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            {items.length === 0 ? 'No results.' : `${items.length} result${items.length === 1 ? '' : 's'} found.`}
          </div>
          <ul className="space-y-4">
            {items.map((it, i) => (
              <li key={`${it.ecb_violation_number}-${i}`} className="border rounded p-4">
                <div className="font-medium">
                  #{it.ecb_violation_number} — {it.ecb_violation_status}
                </div>
                <div className="text-sm text-gray-700">
                  {it.violation_type} • {it.severity} • Issued {it.issue_date_iso || '—'}
                </div>
                <div className="text-sm">Balance due: ${it.balance_due ?? '0'}</div>
                {it.links?.explore && (
                  <div className="mt-2">
                    <a
                      href={it.links.explore}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      View on NYC Open Data
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {loading && <div className="text-gray-600">Loading…</div>}
      {!loading && !items && !error && <div className="text-gray-500">No results yet.</div>}
    </main>
  );
}
