"use client";

import React, { useEffect, useState } from "react";

type Deal = {
  agent_full_name: string;
  representation_code: string;
  representation_label: string;
  property_address: string;
  price_usd: number | string;
  commission_rate_percent: string; // e.g. "1.750"
  split_percent: string;           // e.g. "75.500"
  agent_fee_usd: string;
  company_fee_usd: string;
  gross_commission_usd: string;
  contract_signed: string; // "MM/DD/YYYY"
  contract_closed: string; // "MM/DD/YYYY"
};

const styles = {
  thL: { padding: "8px 12px", textAlign: "left"  as const, borderBottom: "1px solid #eee", whiteSpace: "nowrap" as const },
  thR: { padding: "8px 12px", textAlign: "right" as const, borderBottom: "1px solid #eee", whiteSpace: "nowrap" as const },
  tdL: { padding: "8px 12px", textAlign: "left"  as const, borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" as const, verticalAlign: "top" as const },
  tdR: { padding: "8px 12px", textAlign: "right" as const, borderBottom: "1px solid #f2f2f2", whiteSpace: "nowrap" as const, verticalAlign: "top" as const },
};

const fmt = {
  money(v: unknown, digits = 2) {
    const n = Number(String(v ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n)
      ? n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })
      : String(v ?? "");
  },
  pct(v: unknown) {
    const s = String(v ?? "");
    // trim trailing zeros like "75.500" -> "75.5"
    const trimmed = s.replace(/\.?0+$/, "");
    return trimmed ? `${trimmed}%` : "";
  },
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
        const res = await fetch("/api/crm/deals", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Deal[];
        if (!cancelled) setDeals(json);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!cancelled) setErr(msg);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;
  if (err)      return <p style={{ color: "crimson", padding: 16 }}>Error: {err}</p>;

  return (
    <div style={{ padding: 16 }}>
      <h1>Deals</h1>

      {deals.length === 0 ? (
        <p>No deals yet.</p>
      ) : (
        <table style={{ borderCollapse: "separate", borderSpacing: 0, width: "100%" }}>
          <thead>
            <tr>
              <th style={styles.thL}>Agent</th>
              <th style={styles.thL}>Type</th>
              <th style={styles.thL}>Address</th>
              <th style={styles.thR}>Price</th>
              <th style={styles.thR}>Comm&nbsp;%</th>
              <th style={styles.thR}>Split&nbsp;%</th>
              <th style={styles.thR}>Agent Fee</th>
              <th style={styles.thR}>Company Fee</th>
              <th style={styles.thR}>Gross</th>
              <th style={styles.thL}>Signed</th>
              <th style={styles.thL}>Closed</th>
            </tr>
          </thead>
          <tbody>
            {deals.map((d, i) => (
              <tr key={i}>
                <td style={styles.tdL}>{d.agent_full_name}</td>
                <td style={styles.tdL}>{d.representation_label}</td>
                <td style={styles.tdL}>{d.property_address}</td>
                <td style={styles.tdR}>{fmt.money(d.price_usd, 2)}</td>
                <td style={styles.tdR}>{fmt.pct(d.commission_rate_percent)}</td>
                <td style={styles.tdR}>{fmt.pct(d.split_percent)}</td>
                <td style={styles.tdR}>{fmt.money(d.agent_fee_usd, 0)}</td>
                <td style={styles.tdR}>{fmt.money(d.company_fee_usd, 0)}</td>
                <td style={styles.tdR}>{fmt.money(d.gross_commission_usd, 0)}</td>
                <td style={styles.tdL}>{d.contract_signed}</td>
                <td style={styles.tdL}>{d.contract_closed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}