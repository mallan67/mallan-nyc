/**
 * /sitemap/{id}.xml — one sitemap partition from the shared snapshot (rev 3).
 *
 * id 0 = static/legal/agents/buildings head; ids 1..K = hash-bucketed listing
 * chunks. Every partition reads the SAME cached snapshot object the index
 * reads — one dataset version per cache window; stable-hash membership means
 * a crawl mixing snapshot versions still sees every unchanged canonical URL
 * exactly once.
 *
 * FAIL-CLOSED: snapshot failure → 500. There is NO catch-and-return-empty —
 * a partition is either complete and correct or an explicit failure, never a
 * silently empty <urlset> caused by a query error. Unknown ids → 404.
 */
import { NextRequest, NextResponse } from 'next/server';
import {
  getSitemapSnapshot,
  renderUrlset,
  renderListingUrlset,
} from '@/lib/seo/sitemap-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

const XML_HEADERS = {
  'Content-Type': 'application/xml',
  'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
};

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await ctx.params;
  // strict shape: "<digits>.xml" only
  const m = /^(\d+)\.xml$/.exec(rawId);
  if (!m) return new NextResponse('not found', { status: 404 });
  const id = Number(m[1]);

  let snapshot;
  try {
    snapshot = await getSitemapSnapshot();
  } catch (err) {
    console.error(`[sitemap/${rawId}] snapshot failed (fail-closed):`, err);
    return new NextResponse('sitemap temporarily unavailable', { status: 500 });
  }

  if (id === 0) {
    return new NextResponse(renderUrlset(snapshot.headEntries), { status: 200, headers: XML_HEADERS });
  }
  if (id >= 1 && id <= snapshot.partitions) {
    return new NextResponse(renderListingUrlset(snapshot.listingChunks[id - 1]), {
      status: 200,
      headers: XML_HEADERS,
    });
  }
  return new NextResponse('not found', { status: 404 });
}
