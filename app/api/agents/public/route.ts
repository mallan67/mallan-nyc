// GET /api/agents/public — directory listing for the public /agents page.
// IMPORTANT: Does NOT return individual agent phone/email. Scraping the full
// agent directory with direct contact info is how unauthorized lead-gen vendors
// harvest broker contacts. Phone/email are shown ONLY on the per-agent detail
// page (app/agents/[name]/page.tsx), which is a server-rendered HTML view and
// therefore rate-throttleable by our CDN without bulk-enumeration risk.
// Consumers who want contact info click "View Profile" → see phone/email on
// one agent at a time.
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
    // Fallback to static JSON — strip phone/email here too
    const agentsData = await import('@/data/agents.json');
    const stripped = {
      ...agentsData,
      agents: (agentsData.agents || []).map((a: Record<string, unknown>) => {
        const { phone: _phone, email: _email, ...rest } = a as { phone?: string; email?: string };
        return rest;
      }),
    };
    return NextResponse.json(stripped);
  }
}
