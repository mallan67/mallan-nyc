import { NextResponse } from 'next/server';
import neighborhoodsData from '@/data/neighborhoods.json';

type Props = {
  params: Promise<{ slug: string }>;
};

/**
 * GET /api/neighborhoods/:slug
 *
 * Returns full neighborhood details including attractions
 */
export async function GET(request: Request, { params }: Props) {
  try {
    const { slug } = await params;

    const neighborhood = neighborhoodsData.neighborhoods.find(n => n.id === slug);

    if (!neighborhood) {
      return NextResponse.json(
        { success: false, error: 'Neighborhood not found' },
        { status: 404 }
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
      { status: 500 }
    );
  }
}
