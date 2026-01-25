import { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import neighborhoodsData from '@/data/neighborhoods.json';

type Attraction = {
  name: string;
  type: string;
  description: string;
  address: string;
  link: string | null;
};

type Neighborhood = {
  id: string;
  name: string;
  tagline: string;
  image: string;
  thumbnail: string;
  description: string;
  vibe: string;
  listingCount: number;
  avgPrice: {
    sale: number;
    rent: number;
  };
  boundaries: {
    north: string;
    south: string;
    east: string;
    west: string;
  };
  transit: string[];
  attractions: Attraction[];
  dining: string[];
};

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const neighborhood = (neighborhoodsData.neighborhoods as Neighborhood[]).find(
    (n) => n.id === slug
  );

  if (!neighborhood) {
    return {
      title: 'Neighborhood Not Found | Mallan Real Estate',
    };
  }

  return {
    title: `${neighborhood.name} Real Estate | Mallan Real Estate`,
    description: `Explore ${neighborhood.name} with Mallan Real Estate. ${neighborhood.tagline}. Find homes, apartments, and learn about local attractions.`,
  };
}

export function generateStaticParams() {
  return (neighborhoodsData.neighborhoods as Neighborhood[]).map((n) => ({
    slug: n.id,
  }));
}

function formatPrice(price: number): string {
  if (price >= 1000000) {
    return `$${(price / 1000000).toFixed(1)}M`;
  }
  return `$${(price / 1000).toFixed(0)}K`;
}

function getAttractionIcon(type: string) {
  switch (type) {
    case 'museum':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    case 'park':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
        </svg>
      );
    case 'school':
    case 'university':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
        </svg>
      );
    case 'cultural':
    case 'entertainment':
    case 'music':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
        </svg>
      );
    case 'landmark':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    case 'food':
    case 'restaurant':
    case 'dining':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
        </svg>
      );
    case 'gallery':
    case 'retail':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      );
    case 'recreation':
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    default:
      return (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
  }
}

export default async function NeighborhoodPage({ params }: Props) {
  const { slug } = await params;
  const neighborhood = (neighborhoodsData.neighborhoods as Neighborhood[]).find(
    (n) => n.id === slug
  );

  if (!neighborhood) {
    notFound();
  }

  // Group attractions by type
  const museums = neighborhood.attractions.filter(a => a.type === 'museum');
  const schools = neighborhood.attractions.filter(a => a.type === 'school' || a.type === 'university');
  const parks = neighborhood.attractions.filter(a => a.type === 'park' || a.type === 'recreation');
  const cultural = neighborhood.attractions.filter(a =>
    a.type === 'cultural' || a.type === 'entertainment' || a.type === 'music' || a.type === 'landmark'
  );
  const other = neighborhood.attractions.filter(a =>
    !['museum', 'school', 'university', 'park', 'recreation', 'cultural', 'entertainment', 'music', 'landmark'].includes(a.type)
  );

  return (
    <div className="min-h-screen bg-gray-50 font-serif">
      <Header />

      {/* Hero */}
      <section className="relative h-[50vh] min-h-[400px]">
        <div className="absolute inset-0">
          <Image
            src={neighborhood.image}
            alt={neighborhood.name}
            fill
            className="object-cover"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
        </div>
        <div className="relative z-10 h-full flex items-end">
          <div className="max-w-7xl mx-auto w-full px-4 pb-12">
            <Link
              href="/neighborhoods"
              className="inline-flex items-center gap-2 text-white/80 hover:text-white mb-4 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              All Neighborhoods
            </Link>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-2">
              {neighborhood.name}
            </h1>
            <p className="text-xl md:text-2xl text-white/90">{neighborhood.tagline}</p>
          </div>
        </div>
      </section>

      {/* Quick Stats */}
      <section className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <p className="text-sm text-gray-500 mb-1">Average Sale Price</p>
              <p className="text-2xl font-semibold">{formatPrice(neighborhood.avgPrice.sale)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Average Rent</p>
              <p className="text-2xl font-semibold">${neighborhood.avgPrice.rent.toLocaleString()}/mo</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Active Listings</p>
              <p className="text-2xl font-semibold">{neighborhood.listingCount}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Transit Lines</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {neighborhood.transit.map((line) => (
                  <span
                    key={line}
                    className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-800 text-white text-xs font-bold"
                  >
                    {line}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <main className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-12">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-12">
              {/* Overview */}
              <section>
                <h2 className="text-2xl font-serif mb-4">About {neighborhood.name}</h2>
                <p className="text-gray-700 leading-relaxed text-lg">
                  {neighborhood.description}
                </p>
              </section>

              {/* Vibe */}
              <section className="bg-brand-gold/10 rounded-lg p-6">
                <h3 className="text-lg font-serif mb-3">The Vibe</h3>
                <p className="text-gray-700 leading-relaxed">
                  {neighborhood.vibe}
                </p>
              </section>

              {/* Boundaries */}
              <section>
                <h2 className="text-2xl font-serif mb-4">Boundaries</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="bg-white rounded-lg p-4 border">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">North</p>
                    <p className="font-medium">{neighborhood.boundaries.north}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">South</p>
                    <p className="font-medium">{neighborhood.boundaries.south}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">East</p>
                    <p className="font-medium">{neighborhood.boundaries.east}</p>
                  </div>
                  <div className="bg-white rounded-lg p-4 border">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">West</p>
                    <p className="font-medium">{neighborhood.boundaries.west}</p>
                  </div>
                </div>
              </section>

              {/* Attractions */}
              <section>
                <h2 className="text-2xl font-serif mb-6">Things to Do & See</h2>

                {museums.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-700">
                      {getAttractionIcon('museum')}
                      Museums & Culture
                    </h3>
                    <div className="space-y-4">
                      {museums.map((attraction) => (
                        <AttractionCard key={attraction.name} attraction={attraction} />
                      ))}
                    </div>
                  </div>
                )}

                {schools.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-700">
                      {getAttractionIcon('school')}
                      Schools & Education
                    </h3>
                    <div className="space-y-4">
                      {schools.map((attraction) => (
                        <AttractionCard key={attraction.name} attraction={attraction} />
                      ))}
                    </div>
                  </div>
                )}

                {parks.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-700">
                      {getAttractionIcon('park')}
                      Parks & Recreation
                    </h3>
                    <div className="space-y-4">
                      {parks.map((attraction) => (
                        <AttractionCard key={attraction.name} attraction={attraction} />
                      ))}
                    </div>
                  </div>
                )}

                {cultural.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-700">
                      {getAttractionIcon('landmark')}
                      Landmarks & Entertainment
                    </h3>
                    <div className="space-y-4">
                      {cultural.map((attraction) => (
                        <AttractionCard key={attraction.name} attraction={attraction} />
                      ))}
                    </div>
                  </div>
                )}

                {other.length > 0 && (
                  <div className="mb-8">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2 text-gray-700">
                      {getAttractionIcon('other')}
                      More to Explore
                    </h3>
                    <div className="space-y-4">
                      {other.map((attraction) => (
                        <AttractionCard key={attraction.name} attraction={attraction} />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Dining */}
              <section>
                <h2 className="text-2xl font-serif mb-4">Dining & Nightlife</h2>
                <div className="flex flex-wrap gap-2">
                  {neighborhood.dining.map((restaurant) => (
                    <span
                      key={restaurant}
                      className="px-4 py-2 bg-white border rounded-full text-sm"
                    >
                      {restaurant}
                    </span>
                  ))}
                </div>
              </section>
            </div>

            {/* Sidebar */}
            <div className="lg:col-span-1">
              <div className="sticky top-24 space-y-6">
                {/* Search CTA */}
                <div className="bg-white rounded-lg p-6 border shadow-sm">
                  <h3 className="text-lg font-serif mb-4">Find Your Home in {neighborhood.name}</h3>
                  <div className="space-y-3">
                    <Link
                      href={`/buy?neighborhood=${neighborhood.id}`}
                      className="block w-full text-center px-6 py-3 bg-brand-dark text-white rounded hover:bg-gray-800 transition-colors"
                    >
                      Browse Sales
                    </Link>
                    <Link
                      href={`/rent?neighborhood=${neighborhood.id}`}
                      className="block w-full text-center px-6 py-3 border border-brand-dark text-brand-dark rounded hover:bg-gray-50 transition-colors"
                    >
                      Browse Rentals
                    </Link>
                  </div>
                </div>

                {/* Agent CTA */}
                <div className="bg-brand-gold/10 rounded-lg p-6">
                  <h3 className="text-lg font-serif mb-2">Local Expert</h3>
                  <p className="text-gray-600 text-sm mb-4">
                    Our agents know {neighborhood.name} inside and out. Get personalized recommendations.
                  </p>
                  <Link
                    href="/agents"
                    className="inline-block text-brand-gold hover:underline text-sm font-medium"
                  >
                    Connect with an Agent
                  </Link>
                </div>

                {/* Other Neighborhoods */}
                <div className="bg-white rounded-lg p-6 border">
                  <h3 className="text-lg font-serif mb-4">Explore More</h3>
                  <div className="space-y-3">
                    {(neighborhoodsData.neighborhoods as Neighborhood[])
                      .filter((n) => n.id !== neighborhood.id)
                      .slice(0, 4)
                      .map((n) => (
                        <Link
                          key={n.id}
                          href={`/neighborhoods/${n.id}`}
                          className="block text-gray-700 hover:text-brand-gold transition-colors"
                        >
                          {n.name}
                        </Link>
                      ))}
                  </div>
                  <Link
                    href="/neighborhoods"
                    className="inline-block mt-4 text-sm text-gray-500 hover:text-brand-gold"
                  >
                    View all neighborhoods
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function AttractionCard({ attraction }: { attraction: Attraction }) {
  return (
    <div className="bg-white rounded-lg p-4 border">
      <div className="flex items-start gap-3">
        <span className="text-gray-400 mt-0.5">
          {getAttractionIcon(attraction.type)}
        </span>
        <div className="flex-1">
          <h4 className="font-medium text-gray-900">{attraction.name}</h4>
          <p className="text-sm text-gray-600 mt-1">{attraction.description}</p>
          <p className="text-xs text-gray-400 mt-2">{attraction.address}</p>
          {attraction.link && (
            <a
              href={attraction.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs text-brand-gold hover:underline mt-2"
            >
              Visit website
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
