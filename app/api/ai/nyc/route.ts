import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function ok(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

export async function POST(req: Request) {
  try {
    // Parse URL & body
    const url = new URL(req.url);
    const wantOpen =
      url.searchParams.has('open') ||
      (url.searchParams.get('open') ?? '').toLowerCase() === '1';
    const debugQS =
      (url.searchParams.get('debug') ?? '').toLowerCase() === '1' ||
      (url.searchParams.get('debug') ?? '').toLowerCase() === 'true';

    let body: any = {};
    try {
      body = await req.json();
    } catch {}
    const query: string = (body?.query ?? body?.q ?? '').toString().trim();
    const debugBody = !!body?.debug;
    const wantOpenBody = !!body?.ecbOpen;

    const open = wantOpen || wantOpenBody;
    const debug = debugQS || debugBody;

    if (!query) {
      return ok({ ok: false, error: 'missing query' }, 400);
    }

    // Figure out absolute origin
    const origin =
      (process.env.NEXT_PUBLIC_BASE_URL || '').trim() ||
      new URL(req.url).origin;

    // 1) Geocode (your own geoclient endpoint)
    const geoUrl = new URL(`${origin}/api/geoclient/address`);
    geoUrl.searchParams.set('q', query);
    if (debug) geoUrl.searchParams.set('debug', '1');

    const geoRes = await fetch(geoUrl.toString(), {
      headers: { accept: 'application/json' },
    });
    const geo = await geoRes.json();
    const bin: string | null =
      geo?.bin ?? geo?.data?.bin ?? geo?.address?.buildingIdentificationNumber ?? null;

    // 2) DOB ECB violations (forward open + debug)
    let ecb: any = { ok: false, count: 0, items: [] as any[] };
    if (bin) {
      const ecbUrl = new URL(`${origin}/api/dob/ecb-violations`);
      ecbUrl.searchParams.set('bin', bin);
      if (open) ecbUrl.searchParams.set('open', '1');
      if (debug) ecbUrl.searchParams.set('debug', '1');

      const ecbRes = await fetch(ecbUrl.toString(), {
        headers: { accept: 'application/json' },
      });
      ecb = await ecbRes.json();
    }

    // Quick totals for UI (only when "open" is requested)
    const ecbItems: any[] = Array.isArray(ecb?.items) ? ecb.items : [];
    const ecbBalanceDueTotal = ecbItems.reduce((sum, r) => {
      const n = Number(r?.balance_due ?? 0);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);

    const result: any = {
      ok: true,
      input: query,
      geoclient: { ok: !!geo?.ok || !!bin, source: geoUrl.toString(), data: geo },
      bin: bin ?? undefined,
      sources: {
        ecb_violations: ecb,
      },
      ecb_open_count: open ? ecb?.count ?? 0 : undefined,
      ecb_balance_due_total: open ? ecbBalanceDueTotal : undefined,
    };

    if (debug) {
      result.debug = {
        request: {
          open,
          origin,
          urls: {
            geoclient: geoUrl.toString(),
            ecb:
              bin &&
              (() => {
                const u = new URL(`${origin}/api/dob/ecb-violations`);
                u.searchParams.set('bin', bin);
                if (open) u.searchParams.set('open', '1');
                u.searchParams.set('debug', '1');
                return u.toString();
              })(),
          },
        },
        notes: [
          'Developer Mode is on. These fields exist only when ?debug=1 or body.debug=true.',
        ],
      };
    }

    return ok(result);
  } catch (e: any) {
    return ok({ ok: false, error: e?.message || String(e) }, 500);
  }
}

export async function GET(req: Request) {
  // Allow GET with ?q=... as a convenience for quick tests
  const url = new URL(req.url);
  const q = (url.searchParams.get('q') || '').trim();
  const body = { query: q, debug: url.searchParams.get('debug') === '1', ecbOpen: url.searchParams.get('open') === '1' };
  return POST(new Request(req.url, { method: 'POST', body: JSON.stringify(body) }));
}
