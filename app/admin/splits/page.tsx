"use client";
import { useState } from "react";
export default function SplitsPage() {
  const [agent, setAgent] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [sale, setSale] = useState<number|''>('');
  const [rental, setRental] = useState<number|''>('');
  const [msg, setMsg] = useState("");
  async function save() {
    setMsg("");
    const body = { agent_full_name: agent, year: Number(year), sale_split_pct: sale===''?null:Number(sale), rental_split_pct: rental===''?null:Number(rental) };
    const r = await fetch("/api/splits/upsert", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(body) });
    setMsg(r.ok ? "Saved." : "Error: " + await r.text());
  }
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Agent/Year Splits</h1>
      <div className="text-sm text-gray-500">Data sources: splits • Last updated on save</div>
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3 max-w-3xl">
        <input className="border rounded p-2" placeholder="Agent Full Name" value={agent} onChange={e=>setAgent(e.target.value)} />
        <input className="border rounded p-2" type="number" placeholder="Year" value={year} onChange={e=>setYear(Number(e.target.value))}/>
        <input className="border rounded p-2" type="number" min="0" max="100" step="0.001" placeholder="Sale Split %" value={sale} onChange={e=>setSale(e.target.value as any)} />
        <input className="border rounded p-2" type="number" min="0" max="100" step="0.001" placeholder="Rental Split %" value={rental} onChange={e=>setRental(e.target.value as any)} />
        <button onClick={save} className="rounded bg-black text-white px-4">Save</button>
      </div>
      <div className="text-sm">{msg}</div>
      <a className="inline-block px-4 py-2 rounded-lg border hover:bg-gray-50" href="/admin/agents">← Back to Agents</a>
    </div>
  );
}
