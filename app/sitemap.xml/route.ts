/**
 * /sitemap.xml — sitemap INDEX over the snapshot partitions (rev 3).
 *
 * PLAIN route handler — the generateSitemaps metadata machinery is GONE (it
 * produced a Vercel runtime slug conflict, /sitemap.xml 500 on the exact-head
 * preview). The classic URL is owned directly by this route again; robots.txt
 * and Search Console registrations are unchanged.
 *
 * FAIL-CLOSED: any snapshot failure → 500 (crawlers keep their cached copy).
 * The index is derived from the SAME cached snapshot the partitions serve,
 * so index and partitions can never disagree within a cache window.
 */
import { NextResponse } from 'next/server';
import { getSitemapSnapshot, renderSitemapIndex } from '@/lib/seo/sitemap-snapshot';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

export async function GET() {
  try {
    const snapshot = await getSitemapSnapshot();
    return new NextResponse(renderSitemapIndex(snapshot.partitions, snapshot.generatedAt), {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    console.error('[sitemap.xml] index generation failed (fail-closed):', err);
    return new NextResponse('sitemap temporarily unavailable', { status: 500 });
  }
}
