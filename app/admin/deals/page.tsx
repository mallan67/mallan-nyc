'use client';

import React, { useEffect, useState } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Deal = {
  property_address: string;
  representation_label: string;
  price_usd: number;
  commission_rate_percent: string;
  split_percent: string;
  agent_fee_usd: number | string;
  company_fee_usd: number | string;
  gross_commission_usd: number | string;
  contract_signed: string;
  contract_closed: string;
};

export default function DealsPage() {
  const [rows, setRows] = useState<Deal[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/crm/deals', { cache: 'no-store' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const data = await r.json();
        if (!cancelled) setRows(data);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to load');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <main style={{padding:16}}>Loading deals…</main>;
  if (error)   return <main style={{padding:16}}>Failed to load: {error}</main>;

  return (
    <main style={{ padding: 16 }}>
      <h1>Deals</h1>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th align="left">Address</th>
            <th align="left">Type</th>
            <th align="right">Price</th>
            <th align="right">Comm %</th>
            <th align="right">Split %</th>
            <th align="right">Agent Fee</th>
            <th align="right">Company Fee</th>
            <th align="right">Gross</th>
            <th align="left">Signed</th>
            <th align="left">Closed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={i}>
              <td>{d.property_address}</td>
              <td>{d.representation_label}</td>
              <td align="right">{d.price_usd}</td>
              <td align="right">{d.commission_rate_percent}</td>
              <td align="right">{d.split_percent}</td>
              <td align="right">{d.agent_fee_usd}</td>
              <td align="right">{d.company_fee_usd}</td>
              <td align="right">{d.gross_commission_usd}</td>
              <td>{d.contract_signed}</td>
              <td>{d.contract_closed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
