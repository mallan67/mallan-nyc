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
import {
  directoryFromDatabase,
  type DbAgentDirectoryRow,
} from '@/lib/agents/public-profile-authority';

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
        // needed to DERIVE the professional designation
        license_type: true,
        role: true,
        photo: true,
        bio: true,
        specialties: true,
        languages: true,
        featured: true,
      },
      orderBy: [{ featured: 'desc' }, { created_at: 'asc' }],
    });

    // Titles derived through the one authority. phone/email are dropped below -
    // this endpoint deliberately never returns per-agent contact details.
    // Contact columns are never selected, so they cannot be mapped out by
    // mistake. Titles derived through the one authority.
    const mapped = agents.map((a) =>
      directoryFromDatabase(a as DbAgentDirectoryRow,
        `${a.first_name}-${a.last_name}`.toLowerCase().replace(/\s+/g, '-')));

    return NextResponse.json(
      { agents: mapped },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch (error) {
    console.error('[/api/agents/public] DB error:', error instanceof Error ? error.message : error);
    // Fallback to static JSON — strip phone/email here too
    // 503, not a stale roster. See lib/agents/public-profile-authority.
    return NextResponse.json(
      { error: 'agent_directory_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
