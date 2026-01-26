/**
 * Borough Template - Phase 3 (NON-ROUTABLE)
 *
 * This template lives in src/templates/ and is NOT a Next.js route.
 * It will be imported by an app/boroughs/[slug]/page.tsx ONLY
 * after Phase 4 approval, feature flag enablement, and compliance review.
 *
 * DO NOT move this file to app/ or create a page.tsx that uses it
 * without explicit Phase 4 approval.
 *
 * Compliance: Fair Housing Act compliant - no discriminatory language.
 */

import Link from 'next/link';
import type { Borough, Neighborhood } from '@/src/data/geography/types';

interface BoroughTemplateProps {
  borough: Borough;
  neighborhoods: Neighborhood[];
}

function formatPrice(price: number): string {
  if (price >= 1000000) {
    return `$${(price / 1000000).toFixed(1)}M`;
  }
  return `$${(price / 1000).toFixed(0)}K`;
}

export function BoroughHero({ borough }: { borough: Borough }) {
  return (
    <section className="bg-brand-dark text-white py-16 md:py-24">
      <div className="max-w-7xl mx-auto px-4">
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif mb-4">
          {borough.name}
        </h1>
        <p className="text-xl md:text-2xl text-white/80 mb-6">
          {borough.tagline}
        </p>
        <p className="text-lg text-white/70 max-w-3xl">
          {borough.description}
        </p>
      </div>
    </section>
  );
}

export function BoroughStats({ borough }: { borough: Borough }) {
  return (
    <section className="bg-white border-b">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <p className="text-sm text-gray-500 mb-1">Average Sale Price</p>
            <p className="text-3xl font-semibold">{formatPrice(borough.avgPrice.sale)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Average Rent</p>
            <p className="text-3xl font-semibold">${borough.avgPrice.rent.toLocaleString()}/mo</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">County</p>
            <p className="text-3xl font-semibold">{borough.county}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Neighborhoods</p>
            <p className="text-3xl font-semibold">{borough.neighborhoodCount}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

export function BoroughNeighborhoods({ neighborhoods }: { neighborhoods: Neighborhood[] }) {
  if (neighborhoods.length === 0) {
    return (
      <section className="py-12">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-serif mb-6">Featured Neighborhoods</h2>
          <p className="text-gray-600">
            Neighborhood data coming soon. Contact us for more information.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="py-12">
      <div className="max-w-7xl mx-auto px-4">
        <h2 className="text-2xl font-serif mb-6">Featured Neighborhoods</h2>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {neighborhoods.map((neighborhood) => (
            <div
              key={neighborhood.id}
              className="bg-white rounded-lg border overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-6">
                <h3 className="text-lg font-serif mb-2">{neighborhood.name}</h3>
                <p className="text-sm text-gray-600 mb-4">{neighborhood.tagline}</p>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">
                    Sale: {formatPrice(neighborhood.avgPrice.sale)}
                  </span>
                  <span className="text-gray-500">
                    Rent: ${neighborhood.avgPrice.rent.toLocaleString()}/mo
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export function BoroughCTA({ borough }: { borough: Borough }) {
  return (
    <section className="bg-gray-50 py-12">
      <div className="max-w-7xl mx-auto px-4 text-center">
        <h2 className="text-2xl font-serif mb-4">
          Find Your Home in {borough.name}
        </h2>
        <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
          Browse available properties or connect with a local expert who knows
          {borough.name} inside and out.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={`/buy?borough=${borough.id}`}
            className="px-8 py-3 bg-brand-dark text-white rounded hover:bg-gray-800 transition-colors"
          >
            Browse Sales
          </Link>
          <Link
            href={`/rent?borough=${borough.id}`}
            className="px-8 py-3 border border-brand-dark text-brand-dark rounded hover:bg-gray-50 transition-colors"
          >
            Browse Rentals
          </Link>
          <Link
            href="/agents"
            className="px-8 py-3 border border-gray-300 text-gray-700 rounded hover:bg-gray-100 transition-colors"
          >
            Contact an Agent
          </Link>
        </div>
      </div>
    </section>
  );
}

// Main template component - NOT for direct use in app/
export default function BoroughTemplate({
  borough,
  neighborhoods,
}: BoroughTemplateProps) {
  return (
    <div className="min-h-screen bg-white font-serif">
      <BoroughHero borough={borough} />
      <BoroughStats borough={borough} />
      <BoroughNeighborhoods neighborhoods={neighborhoods} />
      <BoroughCTA borough={borough} />
    </div>
  );
}
