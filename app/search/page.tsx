'use client';

import { Suspense, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

type ApiResponse = {
  ok: boolean; input?: string; bin?: string; bbl?: string; geoclient?: any; sources?: any; missingOrErrored?: any[];
};

function SearchClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const debugParam = (sp?.get('debug') ?? '').toLowerCase();
  const debugOn = debugParam === '1' || debugParam === 'true';

  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggleDebug() {
    const url = new URL(window.location.href);
    debugOn ? url.searchParams.delete('debug') : url.searchParams.set('debug', '1');
    router.replace(url.toString());
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      const url = new URL('/api/ai/nyc', window.location.origin);
      if (openOnly) url.searchParams.set('open', '1');
      if (debugOn)  url.searchParams.set('debug', '1');

      const r = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q, ecbOpen: openOnly, debug: debugOn }),
      });

      const json = (await r.json()) as ApiResponse;
      setData(json);
    } catch (err: any) {
      setError(err?.message ?? String(err)); setData(null);
    } finally { setLoading(false); }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Search – NYC Address Lookup</h1>
        <button onClick={toggleDebug} className={`text-xs rounded px-2 py-1 border ${debugOn ? 'bg-black text-white' : 'bg-white'}`}>
          {debugOn ? 'Developer: ON' : 'Developer: OFF'}
        </button>
      </header>

      <form onSubmit={onSubmit} className="space-y-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g., 300 East 90 Street Manhattan 10128" className="w-full border rounded px-3 py-2" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Only show likely-open ECBs
        </label>
        <button disabled={loading} className="px-4 py-2 rounded bg-black text-white disabled:opacity-50">{loading ? 'Searching…' : 'Search'}</button>
      </form>

      {error && <p className="text-red-600">Error: {error}</p>}
      {data && (<pre className="mt-4 overflow-auto rounded border p-3 text-xs">{JSON.stringify(data, null, 2)}</pre>)}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<div />}>
      <SearchClient />
    </Suspense>
  );
}
