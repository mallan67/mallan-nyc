/**
 * GET /api/dob/ecb-violations
 * Query NYC ECB (Environmental Control Board) violations from NYC Open Data.
 * Params: ?bin=1234567 OR ?address=123+Main+St+New+York
 * Optional: ?open=1 to filter only open violations
 */
import { NextRequest, NextResponse } from 'next/server';

const ECB_ENDPOINT = 'https://data.cityofnewyork.us/resource/6bgk-3dad.json';
const BIS_ENDPOINT = 'https://data.cityofnewyork.us/resource/ic3t-wcy2.json';
const APP_TOKEN = process.env.NYC_OPEN_DATA_TOKEN || '';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let bin = searchParams.get('bin');
  const address = searchParams.get('address');
  const openOnly = searchParams.get('open') === '1';

  // If address provided but no BIN, look up BIN from DOB BIS
  if (!bin && address) {
    try {
      const bisUrl = new URL(BIS_ENDPOINT);
      bisUrl.searchParams.set('$where', `upper(house__) || ' ' || upper(street_name) like upper('%${address.replace(/'/g, "''")}%')`);
      bisUrl.searchParams.set('$limit', '1');
      bisUrl.searchParams.set('$select', 'bin__');
      if (APP_TOKEN) bisUrl.searchParams.set('$$app_token', APP_TOKEN);

      const bisRes = await fetch(bisUrl.toString(), { next: { revalidate: 86400 } });
      if (bisRes.ok) {
        const bisData = await bisRes.json();
        if (bisData[0]?.bin__) bin = bisData[0].bin__;
      }
    } catch { /* fall through */ }
  }

  if (!bin) {
    return NextResponse.json(
      { error: 'BIN or address required. Provide ?bin= or ?address=' },
      { status: 400 }
    );
  }

  try {
    const ecbUrl = new URL(ECB_ENDPOINT);
    let where = `bin='${bin.replace(/'/g, "''")}'`;
    if (openOnly) where += ` AND ecb_violation_status != 'COTALITYLVE'`;
    ecbUrl.searchParams.set('$where', where);
    ecbUrl.searchParams.set('$order', 'issue_date DESC');
    ecbUrl.searchParams.set('$limit', '100');
    if (APP_TOKEN) ecbUrl.searchParams.set('$$app_token', APP_TOKEN);

    const res = await fetch(ecbUrl.toString(), { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json({ items: [], error: 'NYC Open Data unavailable' });
    }

    const raw = await res.json();
    const items = (raw || []).map((r: Record<string, string>) => ({
      ecb_violation_number: r.ecb_violation_number || r.isn_dob_bis_extract,
      ecb_violation_status: r.ecb_violation_status,
      violation_type: r.violation_type,
      severity: r.severity,
      issue_date_iso: r.issue_date ? r.issue_date.split('T')[0] : null,
      balance_due: r.amount_baldue || '0',
      links: {
        explore: `https://data.cityofnewyork.us/Housing-Development/DOB-ECB-Violations/6bgk-3dad/explore?where=bin%3D%27${bin}%27`,
      },
    }));

    return NextResponse.json(
      { items, bin, total: items.length },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } }
    );
  } catch (err) {
    console.error('[ecb-violations]', err instanceof Error ? err.message : err);
    return NextResponse.json({ items: [], error: 'Failed to fetch violations' });
  }
}
