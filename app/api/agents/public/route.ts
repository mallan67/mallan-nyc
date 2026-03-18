import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'active' },
      select: {
        public_slug: true,
        full_name: true,
        first_name: true,
        last_name: true,
        title: true,
        photo: true,
        phone: true,
        email: true,
        bio: true,
        specialties: true,
        languages: true,
        featured: true,
      },
      orderBy: [{ featured: 'desc' }, { created_at: 'asc' }],
    });

    const mapped = agents.map((a) => ({
      id: a.public_slug || `${a.first_name}-${a.last_name}`.toLowerCase().replace(/\s+/g, '-'),
      name: a.full_name || `${a.first_name} ${a.last_name}`,
      title: a.title || 'Licensed Real Estate Salesperson',
      photo: a.photo || '/images/agent-placeholder.svg',
      phone: a.phone || '',
      email: a.email,
      bio: a.bio || '',
      specialties: a.specialties,
      languages: a.languages,
      featured: a.featured,
    }));

    return NextResponse.json(
      { agents: mapped },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    console.error('[/api/agents/public] DB error:', error instanceof Error ? error.message : error);
    // Fallback to static JSON if DB fails
    const agentsData = await import('@/data/agents.json');
    return NextResponse.json(agentsData);
  }
}
