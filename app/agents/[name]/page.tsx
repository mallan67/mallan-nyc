import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import { isReservedAgentSegment } from '@/lib/agents/reserved-slug';
import {
  resolvePublicAgent,
  AgentDirectoryUnavailable,
  type PublicAgentProfile,
  type DbAgentRow,
} from '@/lib/agents/public-profile-authority';
import ActiveListingsTabs from './listings/ActiveListingsTabs';
import PastDealsSection from './PastDealsSection';
import { getPastDeals } from './past-deals-loader';

type Props = {
  params: Promise<{ name: string }>;
};


/**
 * The Agent record is the authority.
 *
 * This used to fall back to data/agents.json whenever it found no ACTIVE
 * database agent - including when the database answered fine and simply had no
 * such agent. A Git-tracked file could therefore RESURRECT a deactivated or
 * permanently deleted agent, and OVERRIDE the canonical record with stale
 * name/title/photo/contact data.
 *
 * Now: a database that replies is final, null included. An unreachable database
 * makes the profile TEMPORARILY UNAVAILABLE — it does not fall back to the
 * static roster, because that would republish a withdrawn licensee's employment
 * and licence status for the duration of any outage.
 */
async function getAgentBySlug(slug: string): Promise<PublicAgentProfile | null> {
  const nameFromSlug = slug.replace(/-/g, ' ');

  return resolvePublicAgent(
    slug,
    async () => {
      const agent = await prisma.agent.findFirst({
        where: {
          OR: [
            { public_slug: slug },
            { full_name: { equals: nameFromSlug, mode: 'insensitive' } },
          ],
          status: 'active',
        },
        select: {
          public_slug: true, full_name: true, first_name: true, last_name: true,
          title: true, license_type: true, photo: true, phone: true,
          email: true, bio: true, specialties: true, languages: true, featured: true,
        },
      });
      return agent as DbAgentRow | null;
    },
  );
}

async function getAgentListings(slug: string): Promise<{
  activeSales: any[];
  activeRentals: any[];
  closedSales: any[];
  closedRentals: any[];
}> {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
      || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
    const res = await fetch(`${baseUrl}/api/agents/${slug}/listings`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch {
    return { activeSales: [], activeRentals: [], closedSales: [], closedRentals: [] };
  }
}

/**
 * THREE distinct outcomes, and the callers must handle all three:
 *
 *   { state: 'found' }        the database answered with an active agent
 *   { state: 'not_found' }    the database answered, and there is none -> 404
 *   { state: 'unavailable' }  the database could NOT answer
 *
 * The third is the one that bit: resolvePublicAgent deliberately THROWS on an
 * outage so a stale Git identity can never be substituted, and both callers
 * were letting that escape as an unhandled server-component error. The policy
 * was right; the presentation was missing.
 */
type ProfileResolution =
  | { state: 'found'; agent: PublicAgentProfile }
  | { state: 'not_found' }
  | { state: 'unavailable' };

async function resolveProfile(slug: string): Promise<ProfileResolution> {
  // ROUTE BOUNDARY. Before any Agent database read, and deliberately so.
  //
  // /agents/sitemap.xml used to reach the Agent lookup and, during an outage,
  // render the profile "temporarily unavailable" page with HTTP 200. A segment
  // that cannot be an agent must be rejected from the segment alone, so the
  // answer never depends on whether the authority can be reached.
  if (isReservedAgentSegment(slug)) return { state: 'not_found' };

  try {
    const agent = await getAgentBySlug(slug);
    return agent ? { state: 'found', agent } : { state: 'not_found' };
  } catch (err) {
    if (err instanceof AgentDirectoryUnavailable) return { state: 'unavailable' };
    throw err;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const resolved = await resolveProfile(name);
  if (resolved.state === 'unavailable') {
    // Do NOT let a transient outage be indexed as the agent's real page.
    return {
      title: 'Agent Profile Temporarily Unavailable | Mallan Real Estate',
      robots: { index: false, follow: false },
    };
  }
  if (resolved.state === 'not_found') return { title: 'Agent Not Found | Mallan Real Estate' };
  const agent = resolved.agent;
  const ogImage = agent.photo && !agent.photo.includes('placeholder')
    ? agent.photo
    : 'https://mallan.nyc/images/og-default.png';
  return {
    title: `${agent.name} | ${agent.title} | Mallan Real Estate`,
    description: `${agent.name}, ${agent.title} at Mallan Real Estate. ${agent.bio.substring(0, 155)}...`,
    // Without this every agent profile inherits the ROOT canonical
    // (`canonical: BASE_URL` in app/layout.tsx) and tells Google the page is
    // the homepage — de-indexing every agent profile into a duplicate of "/".
    // Canonicalise to the agent's own slug, not the raw route param, so a
    // name-derived URL (getAgentBySlug also matches full_name) collapses onto
    // the one canonical profile URL.
    alternates: { canonical: `https://mallan.nyc/agents/${agent.id}` },
    openGraph: {
      title: `${agent.name} | ${agent.title}`,
      description: `${agent.name}, ${agent.title} at Mallan Real Estate.`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: agent.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title: `${agent.name} | ${agent.title}`,
      images: [ogImage],
    },
  };
}

export default async function AgentPage({ params }: Props) {
  const { name } = await params;
  const resolved = await resolveProfile(name);

  if (resolved.state === 'unavailable') {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <main className="pt-20">
          <section className="py-24">
            <div className="max-w-2xl mx-auto px-4 text-center">
              <h1 className="text-2xl font-light text-brand-dark mb-3">
                Profile temporarily unavailable
              </h1>
              <p className="text-brand-dark/80 mb-6">
                We could not load this agent&apos;s profile just now. Please try again shortly.
              </p>
              <p className="text-brand-dark/80">
                <a className="underline" href="tel:+16462584460">(646) 258-4460</a>
                {' · '}
                <Link className="underline" href="/agents">All agents</Link>
              </p>
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (resolved.state === 'not_found') {
    notFound();
  }

  const agent = resolved.agent;

  // Fetch listings and past deals in parallel
  const [listingsData, pastDealsData] = await Promise.all([
    getAgentListings(name),
    getPastDeals(name),
  ]);

  const { activeSales, activeRentals, closedSales, closedRentals } = listingsData;
  const { sales: pastSales, rentals: pastRentals } = pastDealsData;

  // Merge Trestle closed deals with PastDeal DB data, deduplicated
  const pastSaleIds = new Set(pastSales.map((d) => d.listingKey).filter(Boolean));
  const trestleClosedSalesNew = closedSales.filter(
    (l: any) => !pastSaleIds.has(l.mlsId) && !pastSaleIds.has(l.id)
  );
  const pastRentalIds = new Set(pastRentals.map((d) => d.listingKey).filter(Boolean));
  const trestleClosedRentalsNew = closedRentals.filter(
    (l: any) => !pastRentalIds.has(l.mlsId) && !pastRentalIds.has(l.id)
  );

  // Convert Trestle closed listings to PastDeal shape for the component
  const trestleToPastDeal = (l: any, dealType: 'sale' | 'rent') => ({
    id: l.id || l.mlsId,
    listingKey: l.mlsId || l.id,
    street: `${l.address?.streetNumber || ''} ${l.address?.streetName || ''}`.trim(),
    unit: l.address?.unitNumber || null,
    city: l.address?.city || 'New York',
    postalCode: l.address?.postalCode || '',
    neighborhood: l.address?.neighborhood || '',
    closePrice: l.closePrice || l.listPrice || null,
    listPrice: l.listPrice || null,
    closeDate: l.listingContractDate || null,
    beds: l.bedroomsTotal ?? null,
    bathsFull: l.bathroomsFull ?? null,
    bathsHalf: l.bathroomsHalf ?? null,
    sqft: l.livingArea ?? null,
    propertyType: l.propertyType || 'Residential',
    dealType,
    photoUrl: l.media?.[0]?.url || null,
    listingCourtesy: l.listOfficeName || null,
    source: 'trestle' as const,
  });

  const allClosedSales = [
    ...pastSales,
    ...trestleClosedSalesNew.map((l: any) => trestleToPastDeal(l, 'sale')),
  ];
  const allClosedRentals = [
    ...pastRentals,
    ...trestleClosedRentalsNew.map((l: any) => trestleToPastDeal(l, 'rent')),
  ];

  const hasActive = activeSales.length > 0 || activeRentals.length > 0;
  const hasClosed = allClosedSales.length > 0 || allClosedRentals.length > 0;

  // Section nav items
  const navItems = [
    ...(hasActive ? [{ id: 'active-listings', label: 'Active Listings' }] : []),
    ...(hasClosed ? [{ id: 'closed-deals', label: 'Closed Deals' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20">
        {/* Agent Profile Header */}
        <section className="border-b border-black/5">
          <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
            <Link
              href="/agents"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-brand-dark/85 hover:text-brand-gold transition-colors mb-6"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              All Agents
            </Link>

            <div className="flex flex-col md:flex-row gap-6 lg:gap-10">
              {/* Agent Photo */}
              <div className="flex-shrink-0 mx-auto md:mx-0 flex flex-col items-center">
                <div className="relative w-64 h-80 sm:w-72 sm:h-96 overflow-hidden rounded-2xl bg-gray-100">
                  <Image
                    src={agent.photo || '/images/agent-placeholder.svg'}
                    alt={agent.name}
                    fill
                    className="object-cover object-[center_15%]"
                    priority
                  />
                </div>
              </div>

              {/* Agent Info */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                  <h1 className="text-xl sm:text-2xl font-light tracking-wide text-brand-dark">
                    {agent.name}<span className="text-brand-dark/75">,</span>{' '}
                    <span className="text-base sm:text-lg text-brand-dark/85">{agent.title}</span>
                  </h1>
                </div>

                {/* Contact */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4 mb-5">
                  <a
                    href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                    className="inline-flex items-center gap-2 text-sm text-brand-dark hover:text-brand-gold transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                    {agent.phone}
                  </a>
                  <span className="text-brand-dark/20 hidden sm:inline">|</span>
                  <a
                    href={`mailto:${agent.email}`}
                    className="inline-flex items-center gap-2 text-sm text-brand-dark hover:text-brand-gold transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    {agent.email}
                  </a>
                </div>

                {/* Bio */}
                <div className="text-sm text-brand-dark/90 leading-relaxed max-w-2xl mb-5 whitespace-pre-line">
                  {agent.bio}
                </div>

                {/* Specialties */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {agent.specialties.map((specialty, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 ring-1 ring-black/5 text-xs text-brand-dark/90 rounded-full"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>

                {/*
                  Languages — LABELLED and visually distinct from the specialty
                  chips above. They used to render as one more identical pill,
                  so "Buyer Representation" and "English · Spanish" read as a
                  single undifferentiated list and the languages looked missing.
                  Also gated on `> 1` before, so an agent with one language
                  showed none at all. Applies to every agent who has languages.
                */}
                {agent.languages.length > 0 && (
                  <p className="mt-3 text-xs text-brand-dark/85 text-center md:text-left">
                    <span className="uppercase tracking-wide text-brand-dark/55 mr-1.5">
                      Languages
                    </span>
                    {agent.languages.join(', ')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section Navigation */}
        {navItems.length > 0 && (
          <nav className="sticky top-16 z-40 bg-white/80 backdrop-blur-xl border-b border-black/5">
            <div className="max-w-6xl mx-auto px-4">
              <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide">
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex-shrink-0 px-4 py-2 text-xs uppercase tracking-wide text-brand-dark/90 hover:text-brand-gold hover:bg-white/40 rounded transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </nav>
        )}

        {/* Active Listings — Sales / Rentals */}
        {hasActive && (
          <div id="active-listings">
            <ActiveListingsTabs sales={activeSales} rentals={activeRentals} />
          </div>
        )}

        {/* Closed Deals — Sold / Rented (merged Trestle + PastDeal DB) */}
        {hasClosed && (
          <div id="closed-deals">
            <PastDealsSection sales={allClosedSales} rentals={allClosedRentals} />
          </div>
        )}

        {/* No listings message */}
        {!hasActive && !hasClosed && (
          <section className="py-16">
            <div className="max-w-6xl mx-auto px-4 text-center">
              <p className="text-brand-dark/85">
                No listings to display yet. Contact {agent.name.split(' ')[0]} directly to discuss available properties.
              </p>
            </div>
          </section>
        )}

        {/* Contact CTA */}
        <section className="py-12 bg-brand-dark">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-xl sm:text-2xl font-display font-semibold text-white mb-3">
              Work with {agent.name}
            </h2>
            <p className="text-gray-300 text-sm mb-6">
              Ready to buy, sell, or rent? Get in touch today.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white text-brand-dark text-sm font-medium rounded-2xl hover:bg-white/90 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {agent.phone}
              </a>
              <a
                href={`mailto:${agent.email}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-white/30 text-white text-sm font-medium rounded-2xl hover:bg-white/10 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
