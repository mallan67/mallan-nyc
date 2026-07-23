/**
 * /sitemap.xml — sitemap INDEX over the partitioned sitemaps (2026-07-23).
 *
 * app/sitemap.ts now uses `generateSitemaps`, which serves the actual
 * sitemaps at /sitemap/{id}.xml. This route keeps the CLASSIC /sitemap.xml
 * URL alive as a standards-compliant <sitemapindex> pointing at every
 * partition, so robots.txt and existing Search Console registrations keep
 * working unchanged.
 *
 * Partition ids come from the SAME cached partition math the sitemaps use
 * (lib/seo/sitemap-partitions.ts) — index and partitions can never disagree,
 * and the whole set fails closed (500, crawlers keep their cached copy)
 * rather than ever publishing a truncated-but-complete-looking sitemap.
 */
import { NextResponse } from 'next/server';
import { getSitemapPartitionIds } from '@/lib/seo/sitemap-partitions';

const BASE_URL = 'https://mallan.nyc';

export const dynamic = 'force-dynamic';
export const revalidate = 300;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function GET() {
  try {
    const ids = await getSitemapPartitionIds();
    const now = new Date().toISOString();
    const body =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      ids
        .map(
          (id) =>
            `  <sitemap><loc>${escapeXml(`${BASE_URL}/sitemap/${id}.xml`)}</loc><lastmod>${now}</lastmod></sitemap>`,
        )
        .join('\n') +
      `\n</sitemapindex>\n`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
    });
  } catch (err) {
    // FAIL-CLOSED: no index rather than a wrong index.
    console.error('[sitemap.xml] index generation failed:', err);
    return new NextResponse('sitemap temporarily unavailable', { status: 500 });
  }
}
