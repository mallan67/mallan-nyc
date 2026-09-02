import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import prisma from '@/lib/prisma';
import {
  resolvePublicAgent,
  AgentDirectoryUnavailable,
  type DbAgentRow,
} from '@/lib/agents/public-profile-authority';

/** Paragraph separator in stored biographies. */
const PARAGRAPH_BREAK = String.fromCharCode(10, 10);
import ActiveListingsTabs from './ActiveListingsTabs';
import PastDealsSection from '../PastDealsSection';
import { getPastDeals } from '../past-deals-loader';

type Props = {
  params: Promise<{ name: string }>;
};

interface AgentProfile {
  id: string;
  name: string;
  title: string;
  photo: string;
  phone: string;
  email: string;
  bio: string;
  shortBio: string;
  specialties: string[];
  languages: string[];
  featured: boolean;
}

async function getAgentBySlug(slug: string): Promise<AgentProfile | null> {
  const nameFromSlug = slug.replace(/-/g, ' ');

  // Same authority as the profile page: the Agent record answers, a null is
  // authoritative, and an unreachable database fails closed rather than
  // republishing a withdrawn licensee from Git. This surface also used to
  // hardcode 'Licensed Real Estate Salesperson' as its title default, which is
  // exactly how an Associate Broker was publicly mislabelled.
  const profile = await resolvePublicAgent(slug, async () => {
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
        title: true, license_type: true, role: true, photo: true, phone: true,
        email: true, bio: true, specialties: true, languages: true, featured: true,
      },
    });
    return agent as DbAgentRow | null;
  });

  if (!profile) return null;
  const fullBio = profile.bio || '';
  return {
    ...profile,
    shortBio: fullBio.split(PARAGRAPH_BREAK)[0] || fullBio.substring(0, 300),
  };
}

 
interface AgentListingsData {
  activeSales: any[];
  activeRentals: any[];
  closedSales: any[];
  closedRentals: any[];
}

async function getAgentListings(slug: string): Promise<AgentListingsData> {
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
 * Same three-state contract as the profile page. resolvePublicAgent throws on a
 * database outage so a stale Git identity can never be substituted; both
 * callers here were letting that escape as an unhandled server-component error.
 */
type ListingsResolution =
  | { state: 'found'; agent: AgentProfile }
  | { state: 'not_found' }
  | { state: 'unavailable' };

async function resolveAgent(slug: string): Promise<ListingsResolution> {
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
  const resolved = await resolveAgent(name);
  if (resolved.state === 'unavailable') {
    return {
      title: 'Agent Listings Temporarily Unavailable | Mallan Real Estate',
      robots: { index: false, follow: false },
    };
  }
  if (resolved.state === 'not_found') return { title: 'Agent Not Found | Mallan Real Estate' };
  const agent = resolved.agent;
  return {
    title: `${agent.name} — Listings | Mallan Real Estate`,
    description: `View active listings and past deals by ${agent.name}, ${agent.title} at Mallan Real Estate.`,
  };
}

export default async function AgentListingsPage({ params }: Props) {
  const { name } = await params;
  const resolved = await resolveAgent(name);

  if (resolved.state === 'unavailable') {
    return (
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <main className="pt-20">
          <section className="py-24">
            <div className="max-w-2xl mx-auto px-4 text-center">
              <h1 className="text-2xl font-light text-brand-dark mb-3">
                Listings temporarily unavailable
              </h1>
              <p className="text-brand-dark/80">
                Please try again shortly, or call{' '}
                <a className="underline" href="tel:+16462584460">(646) 258-4460</a>.
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

  const { activeSales, activeRentals } = await getAgentListings(name);
  const { sales: pastSales, rentals: pastRentals } = await getPastDeals(name);

  const hasActive = activeSales.length > 0 || activeRentals.length > 0;
  const hasPastDeals = pastSales.length > 0 || pastRentals.length > 0;
  const navItems = [
    ...(hasActive ? [{ id: 'active-listings', label: 'Active Listings' }] : []),
    ...(hasPastDeals ? [{ id: 'past-deals', label: 'Closed Deals' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-20">
        {/* Compact Agent Header — face-focused photo + short bio */}
        <section className="border-b border-black/5">
          <div className="max-w-6xl mx-auto px-4 py-8">
            <Link
              href={`/agents/${name}`}
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-brand-dark/85 hover:text-brand-gold transition-colors mb-6"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Profile
            </Link>

            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              {/* Face-focused circular photo */}
              <div className="flex-shrink-0">
                <div className="relative w-24 h-24 overflow-hidden rounded-full bg-gray-100 ring-2 ring-white/60">
                  <Image
                    src={agent.photo || '/images/agent-placeholder.svg'}
                    alt={agent.name}
                    fill
                    className="object-cover object-[center_15%]"
                    priority
                  />
                </div>
              </div>

              {/* Name + short bio */}
              <div className="flex-1 text-center sm:text-left">
                <h1 className="text-xl font-display font-semibold text-brand-dark">
                  {agent.name}
                </h1>
                <p className="text-sm text-brand-dark/75 mb-2">{agent.title}</p>
                <p className="text-sm text-brand-dark/90 leading-relaxed max-w-2xl">
                  {agent.shortBio}
                </p>

                {/* Contact inline */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-3">
                  <a
                    href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                    className="text-sm text-brand-dark/90 hover:text-brand-gold transition-colors"
                  >
                    {agent.phone}
                  </a>
                  <span className="text-brand-dark/20 hidden sm:inline">|</span>
                  <a
                    href={`mailto:${agent.email}`}
                    className="text-sm text-brand-dark/90 hover:text-brand-gold transition-colors"
                  >
                    {agent.email}
                  </a>
                </div>
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

        {/* Active Listings — Tabbed: Sales / Rentals */}
        {hasActive && (
          <div id="active-listings">
            <ActiveListingsTabs sales={activeSales} rentals={activeRentals} />
          </div>
        )}

        {/* Past Deals — tabbed: Sales / Rentals with pagination */}
        <div id="past-deals">
          <PastDealsSection sales={pastSales} rentals={pastRentals} />
        </div>

        {/* No listings at all */}
        {!hasActive && !hasPastDeals && (
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
                {agent.phone}
              </a>
              <a
                href={`mailto:${agent.email}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-white/30 text-white text-sm font-medium rounded-2xl hover:bg-white/10 transition-colors"
              >
                Email
              </a>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
