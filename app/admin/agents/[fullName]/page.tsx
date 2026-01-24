"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";

const fetcher = (url:string) => fetch(url).then(r=>r.json());
const REP = [
  {code:"LISTING_SALE", label:"Sale Exclusive"},
  {code:"BUYER_REP",    label:"Buyer Representation"},
  {code:"LISTING_RENT", label:"Rental Exclusive"},
  {code:"RENTER_REP",   label:"Renter Representation"},
];

export default function AgentDealsPage({ params }: { params: { fullName: string }}) {
  const fullName = decodeURIComponent(params.fullName);
  const { data, mutate, error, isLoading } = useSWR(`/api/agents/${encodeURIComponent(fullName)}/deals`, fetcher);
  const [savingIndex, setSavingIndex] = useState<number|null>(null);

  const totals = useMemo(() => {
    if (!data) return { deals:0, agent:0, company:0, gross:0 };
    const deals = data.length; let agent=0, company=0, gross=0;
    for (const r of data) {
      agent   += Number(r.agent_fee_usd||0);
      company += Number(r.company_fee_usd||0);
      gross   += Number(r.gross_commission_usd||0);
    }
    return { deals, agent, company, gross };
  }, [data]);

  if (error) return <div className="p-6 text-red-600">Failed to load</div>;
  if (isLoading) return <div className="p-6">Loading…</div>;

  async function saveRow(i:number) {
    setSavingIndex(i);
    const row = data[i];
    const bodyUpdate = {
      agent_full_name: fullName,
      address: row.property_address,
      contract_signed: row.contract_signed, // MM/DD/YYYY
      deal_commission_rate_pct: row.commission_rate_percent ? Number(row.commission_rate_percent) : null,
      deal_split_percent:       row.split_percent ? Number(row.split_percent) : null,
      agent_commission_usd:     row.agent_fee_usd ? Number(row.agent_fee_usd) : null,
    };
    const bodyRep = {
      agent_full_name: fullName,
      address: row.property_address,
      contract_signed: row.contract_signed,
      representation: REP.find(x=>x.label===row.representation_label)?.code ?? null,
    };
    const r1 = await fetch("/api/deals/update", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(bodyUpdate) });
    if (!r1.ok) { alert("Save failed (update): " + (await r1.text())); setSavingIndex(null); return; }
    if (bodyRep.representation) {
      const r2 = await fetch("/api/deals/representation", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(bodyRep) });
      if (!r2.ok) { alert("Save failed (representation): " + (await r2.text())); setSavingIndex(null); return; }
    }
    await mutate();
    setSavingIndex(null);
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">{fullName} — Deals</h1>
      <div className="text-sm text-gray-500">Data sources: agent_deals_v • Last updated on save</div>
      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50"><tr>
            <th className="p-3 text-left">Representation</th>
            <th className="p-3 text-left">Property</th>
            <th className="p-3 text-right">Price $</th>
            <th className="p-3 text-right">% Comm</th>
            <th className="p-3 text-right">% Split</th>
            <th className="p-3 text-right">Agent $</th>
            <th className="p-3 text-right">Company $</th>
            <th className="p-3 text-right">Gross $</th>
            <th className="p-3 text-right">Signed</th>
            <th className="p-3 text-right">Closed</th>
            <th className="p-3"></th>
          </tr></thead>
          <tbody>
            {data.map((r:any, i:number) => (
              <tr key={i} className="odd:bg-white even:bg-gray-50">
                <td className="p-3">
                  <select className="border rounded p-1" value={r.representation_label} onChange={(e)=>{ r.representation_label = e.target.value; }}>
                    {REP.map(x => <option key={x.code} value={x.label}>{x.label}</option>)}
                  </select>
                </td>
                <td className="p-3">{r.property_address}</td>
                <td className="p-3 text-right">${Number(r.price_usd||0).toLocaleString()}</td>
                <td className="p-3 text-right"><input type="number" step="0.001" min="0" max="100" className="w-24 border rounded p-1 text-right" value={r.commission_rate_percent ?? ""} onChange={(e)=>{ r.commission_rate_percent = e.target.value }} /></td>
                <td className="p-3 text-right"><input type="number" step="0.001" min="0" max="100" className="w-24 border rounded p-1 text-right" value={r.split_percent ?? ""} onChange={(e)=>{ r.split_percent = e.target.value }} /></td>
                <td className="p-3 text-right"><input type="number" step="0.01" min="0" className="w-28 border rounded p-1 text-right" value={r.agent_fee_usd ?? ""} onChange={(e)=>{ r.agent_fee_usd = e.target.value }} /></td>
                <td className="p-3 text-right">${Number(r.company_fee_usd||0).toLocaleString()}</td>
                <td className="p-3 text-right">${Number(r.gross_commission_usd||0).toLocaleString()}</td>
                <td className="p-3 text-right">{r.contract_signed}</td>
                <td className="p-3 text-right">{r.contract_closed}</td>
                <td className="p-3 text-right">
                  <button onClick={()=>saveRow(i)} className="px-3 py-1 rounded bg-black text-white disabled:opacity-50" disabled={savingIndex===i}>
                    {savingIndex===i ? "Saving…" : "Save"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50"><tr>
            <td className="p-3 font-medium">Totals</td><td className="p-3"></td><td className="p-3"></td><td className="p-3"></td><td className="p-3"></td>
            <td className="p-3 text-right font-medium">${totals.agent.toLocaleString()}</td>
            <td className="p-3 text-right font-medium">${totals.company.toLocaleString()}</td>
            <td className="p-3 text-right font-medium">${totals.gross.toLocaleString()}</td>
            <td className="p-3" colSpan={3}></td>
          </tr></tfoot>
        </table>
      </div>
      <a className="inline-block px-4 py-2 rounded-lg border hover:bg-gray-50" href="/admin/agents">← Back to Agents</a>
    </div>
  );
}
