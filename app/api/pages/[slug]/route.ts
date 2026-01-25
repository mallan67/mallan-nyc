import { NextResponse } from 'next/server';

// Static imports for Vercel serverless compatibility
import aboutUs from '@/data/pages/about-us.json';
import fairHousing from '@/data/pages/fair-housing.json';
import privacy from '@/data/pages/privacy.json';
import terms from '@/data/pages/terms.json';
import sop from '@/data/pages/sop.json';
import reasonableAccommodations from '@/data/pages/reasonable-accommodations.json';

export const dynamic = 'force-dynamic';

// Map of available pages
const pages: Record<string, unknown> = {
  'about-us': aboutUs,
  'fair-housing': fairHousing,
  privacy: privacy,
  terms: terms,
  sop: sop,
  'reasonable-accommodations': reasonableAccommodations,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const content = pages[slug];

  if (!content) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }

  return NextResponse.json(content);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  // Note: POST is only functional in development (local filesystem)
  // In production, use a database or CMS
  const { slug } = await params;
  return NextResponse.json(
    { error: `POST not supported in production. Edit data/pages/${slug}.json locally.` },
    { status: 501 }
  );
}
