import { NextResponse } from 'next/server';
import { q } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await q`
      SELECT
        a.full_name,
        COUNT(d.*)::int AS deals_count,
        COALESCE(SUM(d.gross_commission_usd), 0)::int AS gross_commission_usd
      FROM agents a
      LEFT JOIN deals d
        ON d.agent_full_name = a.full_name
      GROUP BY a.full_name
      ORDER BY a.full_name;
    `;
    return NextResponse.json(rows);
  } catch (err) {
    console.error('GET /api/agents/summary error:', err);
    // Don’t block builds if the DB is empty—return an empty list.
    return NextResponse.json([]);
  }
}
