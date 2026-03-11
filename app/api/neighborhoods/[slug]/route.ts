import { NextResponse } from 'next/server';
import { findNeighborhoodBySlug } from '@/lib/neighborhoods/boroughs';

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/neighborhoods/:slug
 *
 * Returns full neighborhood details.
 * Source of truth: borough-split JSON files via lib/neighborhoods/boroughs.ts
 */
export async function GET(request: Request, { params }: Props) {
  try {
    const { slug } = await params;

    const neighborhood = findNeighborhoodBySlug(slug);

    if (!neighborhood) {
      return NextResponse.json(
        { success: false, error: 'Neighborhood not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      neighborhood,
    });
  } catch (error) {
    console.error('Error fetching neighborhood:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch neighborhood' },
      { status: 500 },
    );
  }
}
