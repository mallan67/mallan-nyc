import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import listingsData from '@/data/listings.json';
import agentsData from '@/data/agents.json';
import type { Listing } from '@/lib/types/listing';

type Props = {
  params: Promise<{ name: string }>;
};

interface Agent {
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

function getAgentBySlug(slug: string): Agent | null {
  const agentName = slug.replace(/-/g, ' ');
  const agent = agentsData.agents.find(
    (a) => a.name.toLowerCase() === agentName.toLowerCase()
  );
  return agent || null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const agent = getAgentBySlug(name);

  if (!agent) {
    return { title: 'Agent Not Found | Mallan Real Estate' };
  }

  return {
    title: `${agent.name} | ${agent.title} | Mallan Real Estate`,
    description: `Contact ${agent.name}, ${agent.title} at Mallan Real Estate. ${agent.bio.substring(0, 155)}...`,
  };
}

export async function generateStaticParams() {
  return agentsData.agents.map((agent) => ({
    name: agent.name.toLowerCase().replace(/\s+/g, '-'),
  }));
}

// Compact listing card for closed transactions
function ClosedListingCard({ listing, isRental }: { listing: Listing; isRental: boolean }) {
  const price = listing.price.closePrice || listing.price.listPrice;

  return (
    <div className="group bg-white border border-gray-100 rounded overflow-hidden hover:border-brand-gold/30 hover:shadow-md transition-all">
      <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
        <Image
          src={
            listing.media.images.find((img) => img.isPrimary)?.url ||
            listing.media.images[0]?.url ||
            '/images/listing-placeholder.svg'
          }
          alt={`${listing.address.streetNumber} ${listing.address.streetName}`}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
      </div>
      <div className="p-3">
        <p className="font-semibold text-sm text-brand-dark">
          {formatPrice(price, isRental)}
        </p>
        <p className="text-xs text-gray-600 truncate mt-0.5">
          {listing.address.streetNumber} {listing.address.streetName}
          {listing.address.unit && ` #${listing.address.unit}`}
        </p>
        <div className="flex items-center gap-1.5 text-[11px] text-gray-500 mt-1">
          <span>{listing.propertyInfo.propertyType}</span>
          <span className="text-gray-300">|</span>
          <span>{listing.propertyInfo.bedroomsTotal}BR/{listing.propertyInfo.bathroomsFull}BA</span>
          {listing.propertyInfo.aboveGradeFinishedArea > 0 && (
            <>
              <span className="text-gray-300">|</span>
              <span>{listing.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sf</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Active listing card (larger)
function ActiveListingCard({ listing, isRental }: { listing: Listing; isRental: boolean }) {
  return (
    <Link href={`/listing/${listing.id}`} className="group block">
      <div className="relative aspect-[4/3] overflow-hidden rounded bg-gray-100 mb-2">
        <Image
          src={
            listing.media.images.find((img) => img.isPrimary)?.url ||
            listing.media.images[0]?.url ||
            '/images/listing-placeholder.svg'
          }
          alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
        />
        {listing.flags?.isNewListing && (
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-brand-gold text-white text-[10px] uppercase tracking-wide rounded">
            New
          </span>
        )}
      </div>
      <p className="font-semibold text-base text-brand-dark">
        {formatPrice(listing.price.listPrice, isRental)}
      </p>
      <p className="text-sm text-gray-600 truncate">
        {listing.address.streetNumber} {listing.address.streetName}
        {listing.address.unit && ` #${listing.address.unit}`}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">
        {listing.propertyInfo.propertyType} · {listing.propertyInfo.bedroomsTotal} bed · {listing.propertyInfo.bathroomsFull} bath
        {listing.propertyInfo.aboveGradeFinishedArea > 0 && ` · ${listing.propertyInfo.aboveGradeFinishedArea.toLocaleString()} sf`}
      </p>
    </Link>
  );
}

export default async function AgentPage({ params }: Props) {
  const { name } = await params;
  const agent = getAgentBySlug(name);

  if (!agent) {
    notFound();
  }

  const allListings = listingsData.listings as unknown as Listing[];
  const agentListings = allListings.filter(
    (listing) =>
      listing.agent.listAgentName === agent.name ||
      listing.agent.coListAgentName === agent.name
  );

  const activeListings = agentListings.filter((l) => l.status === 'active' && l.listingType === 'sale');
  const activeRentals = agentListings.filter((l) => l.status === 'active' && l.listingType === 'rent');
  const pastSales = agentListings.filter((l) => l.status === 'sold');
  const pastRentals = agentListings.filter((l) => l.status === 'rented');

  const navItems = [
    { id: 'active-sales', label: 'Active Sales', count: activeListings.length },
    { id: 'active-rentals', label: 'Active Rentals', count: activeRentals.length },
    { id: 'closed-sales', label: 'Closed Sales', count: pastSales.length },
    { id: 'closed-rentals', label: 'Closed Rentals', count: pastRentals.length },
  ].filter((item) => item.count > 0);

  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        {/* Agent Profile Header */}
        <section className="border-b">
          <div className="max-w-6xl mx-auto px-4 py-8 sm:py-12">
            <Link
              href="/agents"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-500 hover:text-brand-gold transition-colors mb-6"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              All Agents
            </Link>

            <div className="flex flex-col md:flex-row gap-6 lg:gap-10">
              {/* Agent Photo */}
              <div className="flex-shrink-0 mx-auto md:mx-0">
                <div className="relative w-48 h-48 sm:w-56 sm:h-56 overflow-hidden rounded-full bg-gray-100 ring-4 ring-gray-50">
                  <Image
                    src={agent.photo || '/images/agent-placeholder.svg'}
                    alt={agent.name}
                    fill
                    className="object-cover"
                    priority
                  />
                </div>
              </div>

              {/* Agent Info */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-3 mb-1">
                  <h1 className="text-xl sm:text-2xl font-light tracking-wide text-brand-dark">
                    {agent.name}
                  </h1>
                  {agent.featured && (
                    <span className="px-2 py-0.5 bg-brand-gold/10 text-brand-gold text-[10px] uppercase tracking-wider rounded">
                      Featured
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 uppercase tracking-wide mb-4">
                  {agent.title}
                </p>

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
                  <span className="text-gray-300 hidden sm:inline">|</span>
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
                <p className="text-sm text-gray-600 leading-relaxed max-w-2xl mb-4">
                  {agent.bio}
                </p>

                {/* Specialties & Languages */}
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2">
                  {agent.specialties.map((specialty, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 border border-gray-200 text-xs text-gray-600 rounded"
                    >
                      {specialty}
                    </span>
                  ))}
                  {agent.languages.length > 1 && (
                    <span className="px-2.5 py-1 border border-gray-200 text-xs text-gray-600 rounded">
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
          <nav className="sticky top-16 z-40 bg-white border-b">
            <div className="max-w-6xl mx-auto px-4">
              <div className="flex items-center gap-1 overflow-x-auto py-3 scrollbar-hide">
                {navItems.map((item) => (
                  <a
                    key={item.id}
                    href={`#${item.id}`}
                    className="flex-shrink-0 px-4 py-2 text-xs uppercase tracking-wide text-gray-600 hover:text-brand-gold hover:bg-gray-50 rounded transition-colors"
                  >
                    {item.label}
                    <span className="ml-1.5 text-gray-400">({item.count})</span>
                  </a>
                ))}
              </div>
            </div>
          </nav>
        )}

        {/* Active Sales */}
        {activeListings.length > 0 && (
          <section id="active-sales" className="py-10 scroll-mt-32">
            <div className="max-w-6xl mx-auto px-4">
              <h2 className="text-lg font-light tracking-wide text-brand-dark mb-6 pb-2 border-b">
                Active Sales
                <span className="ml-2 text-sm text-gray-400">({activeListings.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeListings.map((listing) => (
                  <ActiveListingCard key={listing.id} listing={listing} isRental={false} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Active Rentals */}
        {activeRentals.length > 0 && (
          <section id="active-rentals" className="py-10 bg-white scroll-mt-32">
            <div className="max-w-6xl mx-auto px-4">
              <h2 className="text-lg font-light tracking-wide text-brand-dark mb-6 pb-2 border-b border-gray-200">
                Active Rentals
                <span className="ml-2 text-sm text-gray-400">({activeRentals.length})</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {activeRentals.map((listing) => (
                  <ActiveListingCard key={listing.id} listing={listing} isRental={true} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Closed Sales */}
        {pastSales.length > 0 && (
          <section id="closed-sales" className="py-10 scroll-mt-32">
            <div className="max-w-6xl mx-auto px-4">
              <h2 className="text-lg font-light tracking-wide text-brand-dark mb-6 pb-2 border-b">
                Closed Sales
                <span className="ml-2 text-sm text-gray-400">({pastSales.length})</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {pastSales.map((listing) => (
                  <ClosedListingCard key={listing.id} listing={listing} isRental={false} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Closed Rentals */}
        {pastRentals.length > 0 && (
          <section id="closed-rentals" className="py-10 bg-white scroll-mt-32">
            <div className="max-w-6xl mx-auto px-4">
              <h2 className="text-lg font-light tracking-wide text-brand-dark mb-6 pb-2 border-b border-gray-200">
                Closed Rentals
                <span className="ml-2 text-sm text-gray-400">({pastRentals.length})</span>
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                {pastRentals.map((listing) => (
                  <ClosedListingCard key={listing.id} listing={listing} isRental={true} />
                ))}
              </div>
            </div>
          </section>
        )}

        {/* No listings */}
        {activeListings.length === 0 && activeRentals.length === 0 && pastSales.length === 0 && pastRentals.length === 0 && (
          <section className="py-16">
            <div className="max-w-6xl mx-auto px-4 text-center">
              <p className="text-gray-500">
                Contact {agent.name.split(' ')[0]} directly to discuss available properties.
              </p>
            </div>
          </section>
        )}

        {/* Contact CTA */}
        <section className="py-12 bg-brand-dark">
          <div className="max-w-2xl mx-auto px-4 text-center">
            <h2 className="text-xl sm:text-2xl font-light tracking-wide text-white mb-3">
              Work with {agent.name}
            </h2>
            <p className="text-gray-400 text-sm mb-6">
              Ready to buy, sell, or rent? Get in touch today.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-white text-brand-dark text-sm font-medium rounded hover:bg-gray-100 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                {agent.phone}
              </a>
              <a
                href={`mailto:${agent.email}`}
                className="inline-flex items-center justify-center gap-2 px-6 py-2.5 border border-white/30 text-white text-sm font-medium rounded hover:bg-white/10 transition-colors"
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
