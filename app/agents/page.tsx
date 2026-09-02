import { Metadata } from 'next';
import SocialShareBar from '@/app/components/SocialShareBar';
import AgentsGrid from '@/app/components/AgentsGrid';
import prisma from '@/lib/prisma';
import { fromDatabase, fromStatic, type DbAgentRow, type StaticAgentEntry } from '@/lib/agents/public-profile-authority';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Our Agents | Mallan Real Estate',
  description: 'Meet our team of experienced real estate professionals serving New York City.',
  alternates: { canonical: 'https://mallan.nyc/agents' },
  openGraph: {
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.',
    url: 'https://mallan.nyc/agents',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.',
  },
};

/**
 * Roster. Same authority rule as the individual profile: the database answers,
 * and the static roster is consulted ONLY when it is unreachable.
 *
 * Titles are derived through the one title authority so the directory can never
 * advertise a designation that disagrees with the licence.
 */
async function getAgents() {
  try {
    const agents = await prisma.agent.findMany({
      where: { status: 'active' },
      select: {
        public_slug: true, full_name: true, first_name: true, last_name: true,
        title: true, license_type: true, role: true, photo: true, phone: true,
        email: true, bio: true, specialties: true, languages: true, featured: true,
      },
      orderBy: [{ featured: 'desc' }, { created_at: 'asc' }],
    });
    return agents.map((a) =>
      fromDatabase(a as DbAgentRow,
        `${a.first_name}-${a.last_name}`.toLowerCase().replace(/\s+/g, '-')));
  } catch (err) {
    console.error(
      '[agents] database unreachable; serving the static roster for continuity:',
      err instanceof Error ? err.message : err,
    );
    const agentsData = await import('@/data/agents.json');
    return ((agentsData.agents ?? []) as StaticAgentEntry[]).map(fromStatic);
  }
}

export default async function AgentsPage() {
  const agents = await getAgents();

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20">
        <AgentsGrid initialAgents={agents} />
      </main>
      <SocialShareBar title="Our Agents | Mallan Real Estate" />
    </div>
  );
}
