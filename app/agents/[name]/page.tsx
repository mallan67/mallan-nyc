import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import type { PublicListingDTO } from '@/lib/idx/public-dto';
import prisma from '@/lib/prisma';
import agentsJson from '@/data/agents.json';
import PastDealsSection from './PastDealsSection';
import { getPastDeals } from './past-deals-loader';

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
  specialties: string[];
  languages: string[];
  featured: boolean;
}

async function getAgentBySlug(slug: string): Promise<AgentProfile | null> {
  const nameFromSlug = slug.replace(/-/g, ' ');

  // Try DB first
  try {
    const agent = await prisma.agent.findFirst({
      where: {
        OR: [
          { public_slug: slug },
          { full_name: { equals: nameFromSlug, mode: 'insensitive' } },
        ],
        status: 'active',
      },
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
    });
    if (agent) {
      return {
        id: agent.public_slug || slug,
        name: agent.full_name || `${agent.first_name} ${agent.last_name}`,
        title: agent.title || 'Licensed Real Estate Salesperson',
        photo: agent.photo || '/images/agent-placeholder.svg',
        phone: agent.phone || '',
        email: agent.email,
        bio: agent.bio || '',
        specialties: agent.specialties,
        languages: agent.languages,
        featured: agent.featured,
      };
    }
  } catch {
    // DB unavailable — fall through to static JSON
  }

  // Fallback to static agents.json
  const staticAgent = agentsJson.agents.find(
    (a) => a.id === slug || a.name.toLowerCase().replace(/\s+/g, '-') === slug
  );
  return staticAgent || null;
}

interface AgentListingsData {
  activeSales: PublicListingDTO[];
  activeRentals: PublicListingDTO[];
  closedSales: PublicListingDTO[];
  closedRentals: PublicListingDTO[];
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

function formatPrice(price: number, isRental: boolean): string {
  if (isRental) {
    return `$${price.toLocaleString()}/mo`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(price);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const agent = await getAgentBySlug(name);
  if (!agent) return { title: 'Agent Not Found | Mallan Real Estate' };
  return {
    title: `${agent.name} | ${agent.title} | Mallan Real Estate`,
    description: `${agent.name}, ${agent.title} at Mallan Real Estate. ${agent.bio.substring(0, 155)}...`,
  };
}

/* ── Large tile card for active listings ── */
function ActiveListingCard({ listing, isRental }: { listing: PublicListingDTO; isRental: boolean }) {
  const photoUrl = listing.media?.[0]?.url || '/images/listing-placeholder.svg';
  const neighborhood = listing.address.neighborhood || listing.address.city || '';
  const addr = `${listing.address.streetNumber} ${listing.address.streetName}${listing.address.unitNumber ? `, ${listing.address.unitNumber}` : ''}`;

  return (
    <Link
      href={`/listing/${listing.slug}?key=${encodeURIComponent(listing.id)}`}
      className="group block rounded-xl border border-gray-200 bg-white overflow-hidden hover:shadow-lg transition-shadow"
    >
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <Image
          src={photoUrl}
          alt={addr}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        />
        <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-green-600 text-white text-[10px] font-bold rounded uppercase tracking-wide">
          Active
        </span>
        {isRental && (
          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 bg-brand-dark text-white text-[10px] font-bold rounded uppercase tracking-wide">
            Rental
          </span>
        )}
      </div>
      <div className="p-3.5">
        <p className="font-display font-bold text-lg text-brand-dark leading-tight">
          {formatPrice(listing.listPrice, isRental)}
        </p>
        <div className="flex items-center gap-1.5 text-[12px] text-brand-dark/60 mt-1">
          {listing.bedroomsTotal != null && (
            <span>{listing.bedroomsTotal === 0 ? 'Studio' : `${listing.bedroomsTotal} Beds`}</span>
          )}
          {listing.bathroomsFull != null && (
            <>
              <span className="text-brand-dark/20">·</span>
              <span>{listing.bathroomsFull} Baths</span>
            </>
          )}
          {listing.livingArea != null && listing.livingArea > 0 && (
            <>
              <span className="text-brand-dark/20">·</span>
              <span>{listing.livingArea.toLocaleString()} SF</span>
            </>
          )}
        </div>
        <p className="text-sm text-brand-dark/80 mt-1.5 truncate">{addr}</p>
        <p className="text-[11px] text-brand-dark/40">{neighborhood}</p>
      </div>
    </Link>
  );
}

export default async function AgentPage({ params }: Props) {
  const { name } = await params;
  const agent = await getAgentBySlug(name);

  if (!agent) {
    notFound();
  }

  const { activeSales, activeRentals } = await getAgentListings(name);
  const { sales: pastSales, rentals: pastRentals } = await getPastDeals(name);

  const hasActive = activeSales.length > 0 || activeRentals.length > 0;
  const hasPastDeals = pastSales.length > 0 || pastRentals.length > 0;
  const navItems = [
    ...(hasActive ? [{ id: 'active-listings', label: 'Active Listings' }] : []),
    ...(hasPastDeals ? [{ id: 'past-deals', label: 'Past Deals' }] : []),
  ];

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-20">
        {/* Agent Profile Header */}
        <section className="border-b border-black/5">
          <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
            <Link
              href="/agents"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-brand-dark/50 hover:text-brand-gold transition-colors mb-6"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              All Agents
            </Link>

            <div className="flex flex-col md:flex-row gap-6 lg:gap-10">
              {/* Agent Photo — face crop */}
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <div className="relative w-48 h-48 sm:w-56 sm:h-56 overflow-hidden rounded-full bg-gray-100 ring-4 ring-white/60">
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
                    {agent.name}<span className="text-brand-dark/40">,</span>{' '}
                    <span className="text-base sm:text-lg text-brand-dark/50">{agent.title}</span>
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
                <p className="text-sm text-brand-dark/60 leading-relaxed max-w-2xl mb-4">
                  {agent.bio}
                </p>

                {/* Specialties & Languages */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {agent.specialties.map((specialty, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 ring-1 ring-black/5 text-xs text-brand-dark/60 rounded-full"
                    >
                      {specialty}
                    </span>
                  ))}
                  {agent.languages.length > 1 && (
                    <span className="px-2.5 py-1 ring-1 ring-black/5 text-xs text-brand-dark/60 rounded-full">
                      {agent.languages.join(' · ')}
                    </span>
                  )}
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
                    className="flex-shrink-0 px-4 py-2 text-xs uppercase tracking-wide text-brand-dark/60 hover:text-brand-gold hover:bg-white/40 rounded transition-colors"
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </nav>
        )}

        {/* Active Listings — Sales + Rentals combined */}
        {hasActive && (
          <section id="active-listings" className="py-10 scroll-mt-32">
            <div className="max-w-6xl mx-auto px-4">
              {/* Active Sales */}
              {activeSales.length > 0 && (
                <>
                  <h2 className="text-lg font-display font-semibold text-brand-dark mb-4 pb-2 border-b border-black/5">
                    Active Sales
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-8">
                    {activeSales.map((listing) => (
                      <ActiveListingCard key={listing.id} listing={listing} isRental={false} />
                    ))}
                  </div>
                </>
              )}

              {/* Active Rentals */}
              {activeRentals.length > 0 && (
                <>
                  <h2 className="text-lg font-display font-semibold text-brand-dark mb-4 pb-2 border-b border-black/5">
                    Active Rentals
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {activeRentals.map((listing) => (
                      <ActiveListingCard key={listing.id} listing={listing} isRental={true} />
                    ))}
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* Past Deals — tabbed: Sales / Rentals with pagination */}
        <div id="past-deals">
          <PastDealsSection sales={pastSales} rentals={pastRentals} />
        </div>

        {/* No listings */}
        {!hasActive && !hasPastDeals && (
          <section className="py-16">
            <div className="max-w-6xl mx-auto px-4 text-center">
              <p className="text-brand-dark/50">
                Contact {agent.name.split(' ')[0]} directly to discuss available properties.
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
      <Footer />
    </div>
  );
}
