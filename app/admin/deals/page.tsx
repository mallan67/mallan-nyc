"use client";

import React, { useEffect, useState } from 'react';

type Deal = {
  agent_full_name: string;
  representation_code: string;
  representation_label: string;
  property_address: string;
  price_usd: number;
  commission_rate_percent: string;
  split_percent: string;
  agent_fee_usd: string;
  company_fee_usd: string;
  gross_commission_usd: string;
  contract_signed: string;
  contract_closed: string;
};

export default function DealsPage() {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/crm/deals', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Deal[];
        if (!cancelled) setDeals(json);
      } catch (e: any) {
        if (!cancelled) setErr(String(e?.message ?? e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading) return <main style={{ padding: 16 }}>Loading…</main>;
  if (err)     return <main style={{ padding: 16, color: 'crimson' }}>Error: {err}</main>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Deals</h1>
      {deals.length === 0 ? (
        <p>No deals yet.</p>
      ) : (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th align="left">Agent</th>
              <th align="left">Type</th>
              <th align="left">Address</th>
              <th align="right">Price</th>
              <th align="right">Agent Fee</th>
              <th align="right">Company Fee</th>
              <th align="right">Gross</th>
              <th align="left">Signed</th>
              <th align="left">Closed</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d, i) => (
              <tr key={i}>
                <td>{d.agent_full_name}</td>
                <td>{d.representation_label}</td>
                <td>{d.property_address}</td>
                <td align="right">
                  {typeof d.price_usd === 'number' ? d.price_usd.toLocaleString() : d.price_usd}
                </td>
                <td align="right">{d.agent_fee_usd}</td>
                <td align="right">{d.company_fee_usd}</td>
                <td align="right">{d.gross_commission_usd}</td>
                <td>{d.contract_signed}</td>
                <td>{d.contract_closed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
