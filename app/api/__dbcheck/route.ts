// TEMPORARY READ-ONLY DB IDENTITY DIAGNOSTIC (2026-06-02) — DELETE AFTER USE.
// Proves which Neon branch production is connected to and whether the current
// data (SL-0004, agents.trestle_mls_id) exists there. Token-gated; no secrets
// returned (host only, credentials stripped). No writes.
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const TOKEN = 'd8f3k9x2qm-mallan-dbcheck';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('t') !== TOKEN) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const out: Record<string, unknown> = {};

  // 1) Which Neon branch is PRODUCTION pointed at? (host only — no user/password)
  const raw = process.env.DATABASE_URL || '';
  try {
    const u = new URL(raw);
    out.prod_db_host = u.host;                         // ep-XXXX...neon.tech (branch identifier)
    out.prod_db_name = u.pathname.replace(/^\//, '');
    out.expected_current_host = 'ep-cold-waterfall-adno3ao2.c-2.us-east-1.aws.neon.tech';
  } catch {
    out.prod_db_host = '(DATABASE_URL unparseable/empty)';
  }
  const rawUnpooled = process.env.DATABASE_URL_UNPOOLED || '';
  try { out.prod_db_unpooled_host = new URL(rawUnpooled).host; } catch { out.prod_db_unpooled_host = '(none)'; }

  // 2) Does PROD's DB actually contain SL-0004 (the website-only exclusive)?
  try { out.sl0004_count = await prisma.listing.count({ where: { listing_id: 'SL-0004' } }); }
  catch (e) { out.sl0004_error = (e as { code?: string; name?: string })?.code ?? (e as Error)?.name; }

  // 3) Does PROD's DB have the agents.trestle_mls_id column?
  try {
    const rows = await prisma.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'agents' AND column_name = 'trestle_mls_id'`;
    out.has_trestle_mls_id_column = Array.isArray(rows) && rows.length > 0;
  } catch (e) { out.colcheck_error = (e as { code?: string; name?: string })?.code ?? (e as Error)?.name; }

  // 4) Population gauges (is this a current DB or an old/empty branch?)
  try { out.agent_count = await prisma.agent.count(); } catch (e) { out.agent_count_error = (e as { code?: string })?.code; }
  try { out.listing_count = await prisma.listing.count(); } catch (e) { out.listing_count_error = (e as { code?: string })?.code; }
  try {
    out.crm_exclusive_count = await prisma.listing.count({
      where: { OR: [{ listing_id: { startsWith: 'SL-' } }, { listing_id: { startsWith: 'RL-' } }] },
    });
  } catch (e) { out.excl_error = (e as { code?: string })?.code; }

  return NextResponse.json(out);
}
