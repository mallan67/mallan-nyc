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
 * STATUS CODE — the previous note here claimed, without evidence, that a page
 * "has no supported way to set 503" and that a proxy-level 503 was UNVERIFIED.
 * The claim has now been MEASURED against the installed Next.js 16.2.4 with
 * `next build && next start`, and it is replaced by what was observed.
 *
 * An App Router page can produce exactly these statuses:
 *
 *   normal render                        200
 *   notFound()                           404, plus an automatic
 *                                        <meta name="robots" content="noindex">
 *   redirect()                           307 / 308
 *   uncaught throw                       500, plus the same automatic noindex —
 *                                        but the segment error.tsx is NOT in the
 *                                        served HTML, only the generic framework
 *                                        error shell, so the controlled
 *                                        temporarily-unavailable copy is LOST
 *   throw with digest
 *   NEXT_HTTP_ERROR_FALLBACK;503         500, NOT 503
 *
 * The last line is enforced, not incidental. In
 * node_modules/next/dist/client/components/http-access-fallback/http-access-fallback.js
 * the digest status is validated against a fixed allow-list —
 * `{ NOT_FOUND: 404, FORBIDDEN: 403, UNAUTHORIZED: 401 }` — so a 503 digest is
 * not recognised as an access fallback and falls through to `statusCode = 500`.
 * next/navigation exports only notFound / forbidden / unauthorized / redirect /
 * permanentRedirect / unstable_rethrow, none of which sets an availability
 * status, and next/dist/server/request/ exposes no status API at all.
 * `unstable_rethrow` merely re-raises framework control-flow errors.
 *
 * The proxy CAN return 503 for a matched path — that part was verified, and it
 * works. What it cannot do is learn this page's answer. Measured by logging
 * both: the proxy runs strictly BEFORE the page, and the object it returns
 * carries a fixed `status: 200` with a null body, so it has no visibility into
 * whether the authority answered. Emitting 503 from the proxy therefore
 * requires the proxy to make its OWN determination — a second Agent-directory
 * database read, in a bundle that is deliberately kept free of Prisma so the
 * public shell stays static and cacheable.
 *
 * So: BLOCKED, deliberately. 200 + noindex is behaviourally truthful here — the
 * body says unavailable and the head refuses indexation — and the JSON
 * authority endpoint (/api/agents/public) already returns a correct 503. A
 * safe HTML 503 needs an architectural change, not a workaround, and a platform
 * limitation is not a reason to make the proxy a database consumer.
 *
 * The noindex below is therefore the operative protection, not a consolation.
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
        title: true, license_type: true, photo: true, phone: true,
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
