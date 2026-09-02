import { Metadata } from 'next';
import SocialShareBar from '@/app/components/SocialShareBar';
import AgentsGrid from '@/app/components/AgentsGrid';
import prisma from '@/lib/prisma';
import { fromDatabase, type DbAgentRow } from '@/lib/agents/public-profile-authority';

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
    // No static fallback. A Git roster answering for withdrawn licensees is a
    // second identity authority with a trigger condition, not a safety net.
    console.error(
      '[agents] database unreachable; refusing to serve a stale roster:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

export default async function AgentsPage() {
  const agents = await getAgents();

  // Temporarily unavailable beats publishing a stale professional roster.
  if (agents === null) {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <main className="pt-20">
          <section className="py-24">
            <div className="max-w-2xl mx-auto px-4 text-center">
              <h1 className="text-2xl font-light text-brand-dark mb-3">Our Agents</h1>
              <p className="text-brand-dark/80">
                Our agent directory is temporarily unavailable. Please try again shortly,
                or call <a className="underline" href="tel:+16462584460">(646) 258-4460</a>.
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20">
        <AgentsGrid initialAgents={agents} />
      </main>
      <SocialShareBar title="Our Agents | Mallan Real Estate" />
    </div>
  );
}
