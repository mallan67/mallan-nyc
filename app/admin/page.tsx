'use client';

import { useEffect, useState } from 'react';

type Agent = {
  id: string;
  firstName: string; lastName: string;
  email: string; email2?: string | null;
  licenseNo: string;
  licenseExpiry?: string | null;
  saleSplit?: number | null;
  rentSplit?: number | null;
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [form, setForm] = useState({
    firstName: '', lastName: '',
    email: '', email2: '',
    licenseNo: '', licenseExpiry: '',
    saleSplit: '', rentSplit: '',
  });
  const [q, setQ] = useState('');

  async function load() {
    const res = await fetch(`/api/crm/agents${q ? `?q=${encodeURIComponent(q)}` : ''}`, { cache: 'no-store' });
    const data = await res.json();
    setAgents(Array.isArray(data) ? data : []);
  }

  useEffect(() => { load(); /* on first mount */ }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [q]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      saleSplit: form.saleSplit ? Number(form.saleSplit) : undefined,
      rentSplit: form.rentSplit ? Number(form.rentSplit) : undefined,
      licenseExpiry: form.licenseExpiry || undefined,
      email2: form.email2 || undefined,
    };
    const r = await fetch('/api/crm/agents', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await r.json();
    if (!r.ok) { alert(j?.error || 'Failed'); return; }
    setForm({ firstName:'', lastName:'', email:'', email2:'', licenseNo:'', licenseExpiry:'', saleSplit:'', rentSplit:'' });
    await load();
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Agents</h1>

      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <input placeholder="First Name" value={form.firstName} onChange={e=>setForm(s=>({...s, firstName:e.target.value}))} className="border p-2 rounded" required />
        <input placeholder="Last Name" value={form.lastName} onChange={e=>setForm(s=>({...s, lastName:e.target.value}))} className="border p-2 rounded" required />
        <input type="email" placeholder="Email" value={form.email} onChange={e=>setForm(s=>({...s, email:e.target.value}))} className="border p-2 rounded md:col-span-2" required />
        <input type="email" placeholder="2nd email (optional)" value={form.email2} onChange={e=>setForm(s=>({...s, email2:e.target.value}))} className="border p-2 rounded md:col-span-2" />
        <input placeholder="License #" value={form.licenseNo} onChange={e=>setForm(s=>({...s, licenseNo:e.target.value}))} className="border p-2 rounded" required />
        <input type="date" placeholder="License Expiry" value={form.licenseExpiry} onChange={e=>setForm(s=>({...s, licenseExpiry:e.target.value}))} className="border p-2 rounded" />
        <input placeholder="Sale Split % (e.g. 60)" value={form.saleSplit} onChange={e=>setForm(s=>({...s, saleSplit:e.target.value}))} className="border p-2 rounded" />
        <input placeholder="Rental Split % (e.g. 60)" value={form.rentSplit} onChange={e=>setForm(s=>({...s, rentSplit:e.target.value}))} className="border p-2 rounded" />
        <button className="bg-black text-white rounded px-4 py-2 md:col-span-2">Add Agent</button>
      </form>

      <div className="flex items-center gap-2">
        <input placeholder="Search agents…" value={q} onChange={e=>setQ(e.target.value)} className="border p-2 rounded w-full" />
      </div>

      <ul className="divide-y">
        {agents.map(a => (
          <li key={a.id} className="py-3">
            <div className="font-medium">{a.firstName} {a.lastName}</div>
            <div className="text-sm text-gray-600">{a.email}{a.email2 ? ` • ${a.email2}` : ''}</div>
            <div className="text-sm text-gray-600">
              Lic {a.licenseNo}{a.licenseExpiry ? ` • exp ${new Date(a.licenseExpiry).toLocaleDateString()}` : ''}
              {typeof a.saleSplit === 'number' ? ` • Sale ${a.saleSplit}%` : ''}{typeof a.rentSplit === 'number' ? ` • Rent ${a.rentSplit}%` : ''}
            </div>
          </li>
        ))}
        {agents.length === 0 && <li className="py-6 text-gray-500">No agents yet.</li>}
      </ul>
    </div>
  );
}
