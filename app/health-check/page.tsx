'use client';
import { useEffect, useState } from 'react';

export default function HealthCheck() {
  const [msg, setMsg] = useState('Checking…');

  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE;
    if (!base) {
      setMsg('⚠️ NEXT_PUBLIC_API_BASE is not set in Vercel.');
      return;
    }
    fetch(`${base.replace(/\/$/, '')}/search?scope=nyc`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then(() => setMsg(`✅ API reachable at ${base}`))
      .catch(e => setMsg(`❌ API not reachable: ${String(e)}`));
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1>Health Check</h1>
      <p>{msg}</p>
    </main>
  );
}
