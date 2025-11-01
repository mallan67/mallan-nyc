import type { NextApiRequest, NextApiResponse } from "next";
import { q } from "@/lib/db";

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const rows = await q(`
      SELECT
        agent_full_name,
        COUNT(*)::INT                                       AS deal_count,
        SUM(gross_commission_usd)::NUMERIC(14,2)            AS gross_commission_usd,
        SUM(agent_fee_usd)::NUMERIC(14,2)                   AS agent_fee_usd,
        SUM(company_fee_usd)::NUMERIC(14,2)                 AS company_fee_usd
      FROM deals
      GROUP BY agent_full_name
      ORDER BY agent_full_name
    `);
    res.status(200).json(rows);
  } catch (e:any) {
    res.status(500).json({ ok:false, reason:"summary query failed", error:String(e?.message ?? e) });
  }
}