'use client';

import { useEffect, useState } from 'react';

type Agent = { id: string; firstName: string; lastName: string; email: string; licenseNo: string; };
type Deal = {
  id: string;
  agentId: string;
  type: 'SALE' | 'RENT';
  address: string;
  price: number | null;
  agentCommissionPct?: number | null;
  agentCommissionUsd?: number | null;
  splitPct?: number | null;
  signedAt?: string | null;
  closedAt?: string | null;
};

export default function DealsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [form, setForm] = useState({
    agentId: '', type: 'SALE',
    address: '', price: '',
    agentCommissionPct: '', agentCommissionUsd: '',
    splitPct: '', signedAt: '', closedAt: ''
  });

  useEffect(() => {
    (async () => {
      const a = await fetch('/api/crm/agents').then(r=>r.json());
      setAgents(Array.isArray(a) ? a : []);
      const d = await fetch('/api/crm/deals').then(r=>r.json());
      setDeals(Array.isArray(d) ? d : []);
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      ...form,
      price: form.price ? Number(form.price) : undefined,
      agentCommissionPct: form.agentCommissionPct ? Number(form.agentCommissionPct) : undefined,
      agentCommissionUsd: form.agentCommissionUsd ? Number(form.agentCommissionUsd) : undefined,
      splitPct: form.splitPct ? Number(form.splitPct) : undefined,
      signedAt: form.signedAt || undefined,
      closedAt: form.closedAt || undefined,
    };
    const r = await fetch('/api/crm/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const j = await r.json();
    if (!r.ok) { alert(j?.error || 'Failed'); return; }
    setForm({ agentId:'', type:'SALE', address:'', price:'', agentCommissionPct:'', agentCommissionUsd:'', splitPct:'', signedAt:'', closedAt:'' });
    const d = await fetch('/api/crm/deals').then(r=>r.json());
    setDeals(Array.isArray(d) ? d : []);
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-semibold">Deals</h1>

      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <select value={form.agentId} onChange={e=>setForm(s=>({...s, agentId:e.target.value}))} className="border p-2 rounded" required>
          <option value="">Select Agent…</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.firstName} {a.lastName} — {a.licenseNo}</option>)}
        </select>
        <select value={form.type} onChange={e=>setForm(s=>({...s, type:e.target.value as 'SALE'|'RENT'}))} className="border p-2 rounded">
          <option value="SALE">SALE</option>
          <option value="RENT">RENT</option>
        </select>

        <input placeholder="Address" value={form.address} onChange={e=>setForm(s=>({...s, address:e.target.value}))} className="border p-2 rounded md:col-span-2" required />
        <input placeholder="Price" value={form.price} onChange={e=>setForm(s=>({...s, price:e.target.value}))} className="border p-2 rounded" />

        <input placeholder="Agent commission % (e.g. 3)" value={form.agentCommissionPct} onChange={e=>setForm(s=>({...s, agentCommissionPct:e.target.value}))} className="border p-2 rounded" />
        <input placeholder="Agent commission $ (e.g. 36000)" value={form.agentCommissionUsd} onChange={e=>setForm(s=>({...s, agentCommissionUsd:e.target.value}))} className="border p-2 rounded" />
        <input placeholder="Split % (e.g. 60 for agent, 40 broker)" value={form.splitPct} onChange={e=>setForm(s=>({...s, splitPct:e.target.value}))} className="border p-2 rounded" />

        <input type="date" placeholder="Signed date" value={form.signedAt} onChange={e=>setForm(s=>({...s, signedAt:e.target.value}))} className="border p-2 rounded" />
        <input type="date" placeholder="Closed date" value={form.closedAt} onChange={e=>setForm(s=>({...s, closedAt:e.target.value}))} className="border p-2 rounded" />

        <button className="bg-black text-white rounded px-4 py-2 md:col-span-2">Add Deal</button>
      </form>

      <ul className="divide-y">
        {deals.map(d => (
          <li key={d.id} className="py-3">
            <div className="font-medium">{d.type} — {d.address}</div>
            <div className="text-sm text-gray-600">
              Agent {agents.find(a=>a.id===d.agentId)?.firstName} {agents.find(a=>a.id===d.agentId)?.lastName} •
              {d.price ? ` $${d.price.toLocaleString()}` : ' n/a'}
              {typeof d.agentCommissionPct === 'number' ? ` • ${d.agentCommissionPct}%` : ''}
              {typeof d.agentCommissionUsd === 'number' ? ` • $${d.agentCommissionUsd.toLocaleString()}` : ''}
              {typeof d.splitPct === 'number' ? ` • split ${d.splitPct}%` : ''}
            </div>
          </li>
        ))}
        {deals.length === 0 && <li className="py-6 text-gray-500">No deals yet.</li>}
      </ul>
    </div>
  );
}
