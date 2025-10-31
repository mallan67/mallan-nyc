"use client";
import useSWR from "swr";
const fetcher = (url:string) => fetch(url).then(r=>r.json());
export default function AdminAgentsPage() {
  const { data, error, isLoading } = useSWR("/api/agents/summary", fetcher);
  if (error) return <div className="p-6 text-red-600">Failed to load</div>;
  if (isLoading) return <div className="p-6">Loading…</div>;
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Agents — Summary</h1>
      <div className="text-sm text-gray-500">Data sources: agent_deals_summary_v • Last updated on refresh</div>
      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Agent</th>
              <th className="p-3 text-right">Deals</th>
              <th className="p-3 text-right">Sales</th>
              <th className="p-3 text-right">Rentals</th>
              <th className="p-3 text-right">Agent $</th>
              <th className="p-3 text-right">Company $</th>
              <th className="p-3 text-right">Gross $</th>
              <th className="p-3 text-right">Avg % Comm</th>
              <th className="p-3 text-right">Avg % Split</th>
              <th className="p-3 text-right">Last Closed</th>
            </tr>
          </thead>
          <tbody>
            {data.map((r:any) => (
              <tr key={r.agent_full_name} className="odd:bg-white even:bg-gray-50">
                <td className="p-3">
                  <a className="text-blue-600 hover:underline"
                     href={`/admin/agents/${encodeURIComponent(r.agent_full_name)}`}>
                    {r.agent_full_name}
                  </a>
                </td>
                <td className="p-3 text-right">{r.total_deals}</td>
                <td className="p-3 text-right">{r.sale_deals}</td>
                <td className="p-3 text-right">{r.rental_deals}</td>
                <td className="p-3 text-right">${Number(r.total_agent_fee_usd||0).toLocaleString()}</td>
                <td className="p-3 text-right">${Number(r.total_company_fee_usd||0).toLocaleString()}</td>
                <td className="p-3 text-right">${Number(r.total_gross_commission_usd||0).toLocaleString()}</td>
                <td className="p-3 text-right">{r.avg_commission_rate_pct ?? ""}</td>
                <td className="p-3 text-right">{r.avg_split_pct ?? ""}</td>
                <td className="p-3 text-right">{r.last_closed ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <a className="inline-block px-4 py-2 rounded-lg border hover:bg-gray-50" href="/admin/splits">
        Update Agent/Year Splits
      </a>
    </div>
  );
}
