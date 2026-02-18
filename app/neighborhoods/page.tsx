import { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import SocialShareBar from '@/app/components/SocialShareBar';
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
    card: 'summary_large_image',
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

      {/* Hero */}
      <section className="relative h-[340px] sm:h-[400px] md:h-[440px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              'url(https://images.unsplash.com/photo-1534430480872-3498386e7856?w=1600&q=80)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />
        <div className="relative h-full flex flex-col justify-between max-w-7xl mx-auto px-4">
          {/* Breadcrumb at top */}
          <div className="pt-20 sm:pt-24">
            <nav aria-label="Breadcrumb" className="pb-2">
              <ol className="flex items-center gap-1.5 text-sm text-white/70">
                <li>
                  <Link href="/" className="hover:text-brand-gold transition-colors">
                    Home
                  </Link>
                </li>
                <li aria-hidden="true">/</li>
                <li aria-current="page" className="text-white font-medium">
                  Neighborhoods
                </li>
              </ol>
            </nav>
          </div>

          {/* Title at bottom */}
          <div className="pb-8 sm:pb-12">
            <h1 className="font-sans font-black text-4xl sm:text-5xl md:text-6xl text-white tracking-tight leading-none">
              NYC Neighborhood Guides.
            </h1>
            <p className="mt-4 text-lg text-white/65 max-w-2xl">
              Explore real estate across all five boroughs with market data, building intelligence, and broker insights.
            </p>
          </div>
        </div>
      </section>

      <main>
        <section className="py-12 sm:py-16">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6">
              {boroughs.map((b) => (
                <Link
                  key={b.slug}
                  href={`/${b.slug}`}
                  className="liquid-card group block relative overflow-hidden rounded-2xl aspect-[3/2] bg-gray-200"
                >
                  <div className="absolute inset-0 overflow-hidden">
                    <div
                      className="card-img absolute inset-0 bg-cover bg-center"
                      style={{ backgroundImage: `url(${b.heroImage})` }}
                    />
                  </div>
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                       style={{ boxShadow: 'inset 0 0 0 2px rgba(196,160,82,0.6)' }} />
                  {/* No dark overlay — photo fills card fully */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-6">
                    <h2 className="font-sans font-black text-2xl sm:text-3xl text-white leading-none mb-1 group-hover:-translate-y-6 transition-transform duration-500"
                        style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)', textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 4px 12px rgba(0,0,0,0.5)' }}>
                      {b.name}
                    </h2>
                    <div className="overflow-hidden">
                      <div className="translate-y-full opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-500"
                           style={{ transitionTimingFunction: 'cubic-bezier(0.22,1,0.36,1)' }}>
                        <p className="text-white/80 text-sm" style={{ textShadow: '0 1px 4px rgba(0,0,0,0.9), 0 4px 12px rgba(0,0,0,0.5)' }}>{b.tagline}</p>
                        <p className="text-[#C4A052] text-xs font-bold mt-2 tracking-wide">
                          {b.count} neighborhood{b.count !== 1 ? 's' : ''} →
                        </p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 sm:py-14 bg-gray-50">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="font-sans font-black text-3xl sm:text-4xl text-gray-950 mb-3 tracking-tight leading-none">
              Find Your NYC Home.
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

      <SocialShareBar title="NYC Neighborhoods | Mallan Real Estate" />
      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
