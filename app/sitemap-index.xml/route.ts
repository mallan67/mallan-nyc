/**
 * /sitemap-index.xml → 308 permanent redirect to /sitemap.xml (rev 3).
 *
 * The rev-2 architecture briefly served the index here (Next's
 * generateSitemaps machinery reserved /sitemap.xml). rev 3 owns /sitemap.xml
 * directly with a plain route handler, so this URL — which appeared only on
 * that short-lived preview — cleanly redirects to the canonical index on the
 * SAME host (previews redirect within the preview).
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL('/sitemap.xml', req.url), 308);
}
