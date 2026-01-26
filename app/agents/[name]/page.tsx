import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import listingsData from '@/data/listings.json';
import type { Listing } from '@/lib/types/listing';

// Mock agent data - replace with API call when available
const MOCK_AGENTS = [
  {
    id: '1',
    name: 'Maya Allan',
    title: 'Licensed Real Estate Broker',
    photo: '/images/agents/maya-allan.jpg',
    phone: '(646) 258-4460',
    email: 'maya@mallan.nyc',
    bio: 'Maya Allan is an experienced real estate professional specializing in Manhattan and Brooklyn properties.',
    specialties: ['Luxury Sales', 'Investment Properties', 'First-Time Buyers'],
    languages: ['English', 'Spanish'],
    featured: true,
  },
];

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

async function getAgentBySlug(slug: string): Promise<Agent | null> {
  // Try API first, fallback to mock data
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/agents/public`, { cache: 'no-store' });
    const data = await res.json();
    const agents = data.agents || [];
    const agentName = slug.replace(/-/g, ' ');
    return agents.find((a: Agent) => a.name.toLowerCase() === agentName.toLowerCase()) || null;
  } catch {
    // Fallback to mock data
    const agentName = slug.replace(/-/g, ' ');
    return MOCK_AGENTS.find(a => a.name.toLowerCase() === agentName.toLowerCase()) || null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const agent = await getAgentBySlug(name);

  if (!agent) {
    return { title: 'Agent Not Found | Mallan Real Estate' };
  }

  return {
    title: `${agent.name} | ${agent.title} | Mallan Real Estate`,
    description: `Contact ${agent.name}, ${agent.title} at Mallan Real Estate. ${agent.bio}`,
  };
}

export async function generateStaticParams() {
  return MOCK_AGENTS.map(agent => ({
    name: agent.name.toLowerCase().replace(/\s+/g, '-'),
  }));
}

export default async function AgentPage({ params }: Props) {
  const { name } = await params;
  const agent = await getAgentBySlug(name);

  if (!agent) {
    notFound();
  }

  // Get all listings
  const allListings = listingsData.listings as unknown as Listing[];

  // Filter agent's listings
  const agentListings = allListings.filter(listing =>
    listing.agent.listAgentName === agent.name ||
    listing.agent.coListAgentName === agent.name
  );

  // Active listings for sale
  const activeListings = agentListings.filter(l =>
    l.status === 'active' && l.listingType === 'sale'
  );

  // Active rentals
  const activeRentals = agentListings.filter(l =>
    l.status === 'active' && l.listingType === 'rent'
  );

  // Past transactions (sold/rented)
  const pastListings = agentListings.filter(l =>
    l.status === 'sold' || l.status === 'rented'
  );

  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        {/* Agent Profile Section */}
        <section className="py-12 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4">
            <Link href="/agents" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-8">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to All Agents
            </Link>

            <div className="grid md:grid-cols-3 gap-8">
              {/* Agent Photo */}
              <div>
                <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 mb-4">
                  <Image
                    src={agent.photo || '/images/agent-placeholder.jpg'}
                    alt={agent.name}
                    fill
                    className="object-cover"
                  />
                  {agent.featured && (
                    <span className="absolute top-3 left-3 px-3 py-1 bg-brand-gold text-white text-xs uppercase tracking-wide rounded">
                      Featured
                    </span>
                  )}
                </div>
              </div>

              {/* Agent Info */}
              <div className="md:col-span-2">
                <h1 className="text-3xl md:text-4xl font-semibold mb-2">{agent.name}</h1>
                <p className="text-lg text-gray-600 mb-6">{agent.title}</p>

                {/* Contact Info */}
                <div className="bg-white rounded-lg p-6 mb-6 shadow-sm border">
                  <h2 className="font-semibold mb-4">Contact Information</h2>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <a href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`} className="text-brand-gold hover:underline">
                        {agent.phone}
                      </a>
                    </div>
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      <a href={`mailto:${agent.email}`} className="text-brand-gold hover:underline">
                        {agent.email}
                      </a>
                    </div>
                  </div>
                </div>

                {/* Bio */}
                {agent.bio && (
                  <div className="mb-6">
                    <h2 className="font-semibold mb-3">About</h2>
                    <p className="text-gray-700 leading-relaxed">{agent.bio}</p>
                  </div>
                )}

                {/* Specialties */}
                {agent.specialties && agent.specialties.length > 0 && (
                  <div className="mb-6">
                    <h2 className="font-semibold mb-3">Specialties</h2>
                    <div className="flex flex-wrap gap-2">
                      {agent.specialties.map((specialty, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded"
                        >
                          {specialty}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Languages */}
                {agent.languages && agent.languages.length > 0 && (
                  <div>
                    <h2 className="font-semibold mb-3">Languages</h2>
                    <p className="text-gray-700">{agent.languages.join(', ')}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Active Listings for Sale */}
        {activeListings.length > 0 && (
          <section className="py-12">
            <div className="max-w-7xl mx-auto px-4">
              <h2 className="text-2xl font-semibold mb-6">Active Listings for Sale</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {activeListings.map(listing => (
                  <Link key={listing.id} href={`/listing/${listing.id}`} className="group">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 mb-3">
                      <Image
                        src={listing.media.images.find(img => img.isPrimary)?.url || listing.media.images[0]?.url || '/images/listing-placeholder.jpg'}
                        alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <p className="font-semibold text-lg">{formatPrice(listing.price.listPrice, false)}</p>
                    <p className="text-sm text-gray-600">
                      {listing.propertyInfo.propertyType}, {listing.address.neighborhoodDisplay}
                    </p>
                    <p className="text-xs text-gray-500">
                      {listing.propertyInfo.bedroomsTotal} bed · {listing.propertyInfo.bathroomsFull} bath
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Active Rentals */}
        {activeRentals.length > 0 && (
          <section className="py-12 bg-gray-50">
            <div className="max-w-7xl mx-auto px-4">
              <h2 className="text-2xl font-semibold mb-6">Active Rentals</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {activeRentals.map(listing => (
                  <Link key={listing.id} href={`/listing/${listing.id}`} className="group">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 mb-3">
                      <Image
                        src={listing.media.images.find(img => img.isPrimary)?.url || listing.media.images[0]?.url || '/images/listing-placeholder.jpg'}
                        alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform"
                      />
                    </div>
                    <p className="font-semibold text-lg">{formatPrice(listing.price.listPrice, true)}</p>
                    <p className="text-sm text-gray-600">
                      {listing.propertyInfo.propertyType}, {listing.address.neighborhoodDisplay}
                    </p>
                    <p className="text-xs text-gray-500">
                      {listing.propertyInfo.bedroomsTotal} bed · {listing.propertyInfo.bathroomsFull} bath
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Past Transactions */}
        {pastListings.length > 0 && (
          <section className="py-12">
            <div className="max-w-7xl mx-auto px-4">
              <h2 className="text-2xl font-semibold mb-6">Past Transactions</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {pastListings.map(listing => (
                  <div key={listing.id} className="relative">
                    <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100 mb-3">
                      <Image
                        src={listing.media.images.find(img => img.isPrimary)?.url || listing.media.images[0]?.url || '/images/listing-placeholder.jpg'}
                        alt={`${listing.propertyInfo.propertyType} in ${listing.address.neighborhoodDisplay}`}
                        fill
                        className="object-cover opacity-75"
                      />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="px-4 py-2 bg-black/70 text-white text-sm font-semibold rounded">
                          {listing.status === 'sold' ? 'SOLD' : 'RENTED'}
                        </span>
                      </div>
                    </div>
                    <p className="font-semibold text-lg">{formatPrice(listing.price.listPrice, listing.listingType === 'rent')}</p>
                    <p className="text-sm text-gray-600">
                      {listing.propertyInfo.propertyType}, {listing.address.neighborhoodDisplay}
                    </p>
                    <p className="text-xs text-gray-500">
                      {listing.propertyInfo.bedroomsTotal} bed · {listing.propertyInfo.bathroomsFull} bath
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* No listings message */}
        {activeListings.length === 0 && activeRentals.length === 0 && pastListings.length === 0 && (
          <section className="py-12">
            <div className="max-w-7xl mx-auto px-4 text-center">
              <p className="text-gray-600">This agent currently has no public listings.</p>
            </div>
          </section>
        )}

        {/* Contact CTA */}
        <section className="py-12 bg-brand-dark text-white">
          <div className="max-w-3xl mx-auto px-4 text-center">
            <h2 className="text-2xl md:text-3xl font-semibold mb-4">
              Ready to Work with {agent.name}?
            </h2>
            <p className="text-gray-300 mb-8">
              Contact {agent.name.split(' ')[0]} directly to discuss your real estate needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href={`tel:${agent.phone.replace(/[^0-9]/g, '')}`}
                className="inline-block px-8 py-3 bg-white text-brand-dark font-medium rounded hover:bg-gray-100 transition-colors"
              >
                Call {agent.phone}
              </a>
              <a
                href={`mailto:${agent.email}`}
                className="inline-block px-8 py-3 border border-white text-white font-medium rounded hover:bg-white/10 transition-colors"
              >
                Send Email
              </a>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
