import { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import { ALL_BOROUGH_SLUGS, getBoroughConfig, loadNeighborhoods } from '@/lib/neighborhoods/boroughs';

export const metadata: Metadata = {
  title: 'NYC Neighborhoods | All 5 Boroughs | Mallan Real Estate',
  description:
    'Explore neighborhoods across all five NYC boroughs — Manhattan, Brooklyn, Queens, Bronx, and Staten Island. Market data, featured buildings, and real estate guides.',
  alternates: { canonical: 'https://mallan.nyc/neighborhoods' },
  openGraph: {
    title: 'NYC Neighborhoods | All 5 Boroughs | Mallan Real Estate',
    description:
      'Explore neighborhoods across all five NYC boroughs with market data and real estate guides.',
    url: 'https://mallan.nyc/neighborhoods',
  },
  twitter: {
    title: 'NYC Neighborhoods | All 5 Boroughs | Mallan Real Estate',
    description:
      'Explore neighborhoods across all five NYC boroughs with market data and real estate guides.',
  },
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
    { '@type': 'ListItem', position: 2, name: 'Neighborhoods', item: 'https://mallan.nyc/neighborhoods' },
  ],
};

export const revalidate = 3600;

export default function NeighborhoodsIndexPage() {
  const boroughs = ALL_BOROUGH_SLUGS.map((slug) => {
    const config = getBoroughConfig(slug);
    const neighborhoods = loadNeighborhoods(slug);
    return { ...config, count: neighborhoods.length };
  });

  return (
    <>
      <Header dark />

      <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 pt-24 pb-2">
        <ol className="flex items-center gap-1.5 text-sm text-gray-500">
          <li>
            <Link href="/" className="hover:text-brand-gold transition-colors">
              Home
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="text-gray-900 font-medium">
            Neighborhoods
          </li>
        </ol>
      </nav>

      {/* Hero */}
      <section className="relative h-[280px] sm:h-[340px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=80)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative h-full flex flex-col justify-end max-w-7xl mx-auto px-4 pb-8 sm:pb-12">
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold text-white tracking-tight">
            NYC Neighborhood Guides
          </h1>
          <p className="mt-2 text-lg text-white/80 font-light max-w-2xl">
            Explore real estate across all five boroughs with market data, building intelligence,
            and broker insights.
          </p>
        </div>
      </section>

      <main>
        <section className="py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {boroughs.map((b) => (
                <Link
                  key={b.slug}
                  href={`/${b.slug}`}
                  className="group block relative overflow-hidden rounded-lg aspect-[3/2]"
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
                    style={{ backgroundImage: `url(${b.heroImage})` }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5">
                    <h2 className="text-2xl font-semibold text-white">{b.name}</h2>
                    <p className="text-sm text-white/80 mt-1">{b.tagline}</p>
                    <p className="text-xs text-white/60 mt-2">
                      {b.count} neighborhood{b.count !== 1 ? 's' : ''}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 sm:py-14 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-3">
              Find Your NYC Home
            </h2>
            <p className="text-gray-500 mb-8 max-w-xl mx-auto">
              Search active listings across all five boroughs or speak with our team for
              personalized guidance.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/buy"
                className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm sm:text-base"
              >
                Search All Listings
              </Link>
              <Link
                href="/contact"
                className="inline-block px-8 py-3 border border-gray-900 text-gray-900 font-medium rounded-lg hover:bg-gray-900 hover:text-white transition-colors text-sm sm:text-base"
              >
                Get a Free Consultation
              </Link>
            </div>
          </div>
        </section>
      </main>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <IDXDisclaimer variant="compact" />
      </div>

      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
