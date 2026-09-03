import { Metadata } from 'next';
import { cache } from 'react';
import SocialShareBar from '@/app/components/SocialShareBar';
import AgentsGrid from '@/app/components/AgentsGrid';
import prisma from '@/lib/prisma';
import { fromDatabase, type DbAgentRow } from '@/lib/agents/public-profile-authority';

export const revalidate = 3600;

const DIRECTORY_DESCRIPTION =
  'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.';

/**
 * The outage page must not be INDEXABLE as the agent directory.
 *
 * This was `export const metadata` — one fixed object that always claimed
 * `canonical: https://mallan.nyc/agents` and never set robots. When the
 * database is unreachable the body correctly degrades to "temporarily
 * unavailable", but the head still invited a crawler to index that empty
 * apology AS the canonical roster of Mallan's licensees, and to keep serving it
 * from the index after the outage ended.
 *
 * Failing closed in the body and advertising the failure in the head are not
 * the same thing. Both sibling routes (`/agents/[name]` and
 * `/agents/[name]/listings`) already noindex their unavailable state; the
 * roster was the one public agent surface that did not.
 *
 * NOTE ON STATUS CODE: this still responds HTTP 200. A Next.js App Router page
 * has no supported way to set 503 on a rendered page — `notFound()` (404) is
 * the only status interrupt available, and a 404 would assert the directory
 * does not exist, which is a different and worse lie. `robots: noindex` is the
 * strongest correct signal available at this layer. UNVERIFIED whether a
 * proxy-level 503 is worth adding; it is deliberately not attempted here.
 */
export async function generateMetadata(): Promise<Metadata> {
  const agents = await getAgents();

  if (agents === null) {
    return {
      title: 'Agent Directory Temporarily Unavailable | Mallan Real Estate',
      robots: { index: false, follow: false },
    };
  }

  return {
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of experienced real estate professionals serving New York City.',
    alternates: { canonical: 'https://mallan.nyc/agents' },
    openGraph: {
      title: 'Our Agents | Mallan Real Estate',
      description: DIRECTORY_DESCRIPTION,
      url: 'https://mallan.nyc/agents',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Our Agents | Mallan Real Estate',
      description: DIRECTORY_DESCRIPTION,
    },
  };
}

/**
 * Roster. Same authority rule as the individual profile: the database answers,
 * and the static roster is consulted ONLY when it is unreachable.
 *
 * Wrapped in React `cache()` so generateMetadata and the page body share ONE
 * read per request. Without it, adding the metadata branch would have doubled
 * the roster query on every ISR regeneration — and, worse, let the head and the
 * body disagree if the database changed state between the two calls.
 *
 * Titles are derived through the one title authority so the directory can never
 * advertise a designation that disagrees with the licence.
 */
const getAgents = cache(async () => {
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
});

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
