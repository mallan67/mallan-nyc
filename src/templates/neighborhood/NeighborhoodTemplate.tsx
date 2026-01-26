/**
 * Neighborhood Template - Phase 3 (NON-ROUTABLE)
 *
 * This template lives in src/templates/ and is NOT a Next.js route.
 * It will be imported by an app/neighborhoods/[slug]/page.tsx ONLY
 * after Phase 4 approval, feature flag enablement, and compliance review.
 *
 * DO NOT move this file to app/ or create a page.tsx that uses it
 * without explicit Phase 4 approval.
 *
 * Compliance: Fair Housing Act compliant - no discriminatory language.
 */

import Image from 'next/image';
import Link from 'next/link';
import type { Neighborhood } from '@/src/data/geography/types';

interface NeighborhoodTemplateProps {
  neighborhood: Neighborhood;
  allNeighborhoods: Neighborhood[];
}

function formatPrice(price: number): string {
  if (price >= 1000000) {
    return `$${(price / 1000000).toFixed(1)}M`;
  }
  return `$${(price / 1000).toFixed(0)}K`;
}

function getAttractionIcon(type: string) {
  const icons: Record<string, JSX.Element> = {
    museum: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
    park: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
      </svg>
    ),
    school: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 14l9-5-9-5-9 5 9 5z" />
      </svg>
    ),
  };
  return icons[type] || icons.park;
}

export function NeighborhoodHero({ neighborhood }: { neighborhood: Neighborhood }) {
  return (
    <section className="relative h-[50vh] min-h-[400px]">
      <div className="absolute inset-0">
        <Image
          src={neighborhood.image}
          alt={`${neighborhood.name} neighborhood`}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/20" />
      </div>
      <div className="relative z-10 h-full flex items-end">
        <div className="max-w-7xl mx-auto w-full px-4 pb-12">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif text-white mb-2">
            {neighborhood.name}
          </h1>
          <p className="text-xl md:text-2xl text-white/90">{neighborhood.tagline}</p>
        </div>
      </div>
    </section>
  );
}

export function NeighborhoodStats({ neighborhood }: { neighborhood: Neighborhood }) {
  return (
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
  );
}

export function NeighborhoodContent({ neighborhood }: { neighborhood: Neighborhood }) {
  return (
    <div className="space-y-12">
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
          {Object.entries(neighborhood.boundaries).map(([direction, boundary]) => (
            <div key={direction} className="bg-white rounded-lg p-4 border">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{direction}</p>
              <p className="font-medium">{boundary}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Attractions */}
      {neighborhood.attractions.length > 0 && (
        <section>
          <h2 className="text-2xl font-serif mb-6">Things to Do & See</h2>
          <div className="space-y-4">
            {neighborhood.attractions.map((attraction) => (
              <div key={attraction.name} className="bg-white rounded-lg p-4 border">
                <div className="flex items-start gap-3">
                  <span className="text-gray-400 mt-0.5">
                    {getAttractionIcon(attraction.type)}
                  </span>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{attraction.name}</h4>
                    <p className="text-sm text-gray-600 mt-1">{attraction.description}</p>
                    <p className="text-xs text-gray-400 mt-2">{attraction.address}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Dining */}
      {neighborhood.dining.length > 0 && (
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
      )}
    </div>
  );
}

export function NeighborhoodSidebar({
  neighborhood,
  otherNeighborhoods,
}: {
  neighborhood: Neighborhood;
  otherNeighborhoods: Neighborhood[];
}) {
  return (
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
      {otherNeighborhoods.length > 0 && (
        <div className="bg-white rounded-lg p-6 border">
          <h3 className="text-lg font-serif mb-4">Explore More</h3>
          <div className="space-y-3">
            {otherNeighborhoods.slice(0, 4).map((n) => (
              <span key={n.id} className="block text-gray-700">
                {n.name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Main template component - NOT for direct use in app/
export default function NeighborhoodTemplate({
  neighborhood,
  allNeighborhoods,
}: NeighborhoodTemplateProps) {
  const otherNeighborhoods = allNeighborhoods.filter((n) => n.id !== neighborhood.id);

  return (
    <div className="min-h-screen bg-gray-50 font-serif">
      <NeighborhoodHero neighborhood={neighborhood} />
      <NeighborhoodStats neighborhood={neighborhood} />

      <main className="py-12 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-12">
            <div className="lg:col-span-2">
              <NeighborhoodContent neighborhood={neighborhood} />
            </div>
            <div className="lg:col-span-1">
              <NeighborhoodSidebar
                neighborhood={neighborhood}
                otherNeighborhoods={otherNeighborhoods}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
