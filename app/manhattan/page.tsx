import { Metadata } from 'next';
import Link from 'next/link';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import NeighborhoodBreadcrumb from '@/app/components/neighborhoods/NeighborhoodBreadcrumb';
import NeighborhoodHubGrid from '@/app/components/neighborhoods/NeighborhoodHubGrid';
import { loadNeighborhoods, getBoroughConfig } from '@/lib/neighborhoods/boroughs';

const config = getBoroughConfig('manhattan');
const neighborhoods = loadNeighborhoods('manhattan');

export const metadata: Metadata = {
  title: 'Manhattan Neighborhoods | Real Estate Guide | Mallan Real Estate',
  description:
    'Explore Manhattan neighborhoods with market data, featured buildings, and listings. From the Upper East Side to Tribeca, find your perfect NYC home.',
  alternates: { canonical: 'https://mallan.nyc/manhattan' },
  openGraph: {
    title: 'Manhattan Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Manhattan neighborhoods with market data, featured buildings, and listings.',
    url: 'https://mallan.nyc/manhattan',
  },
  twitter: {
    title: 'Manhattan Neighborhoods | Real Estate Guide | Mallan Real Estate',
    description:
      'Explore Manhattan neighborhoods with market data, featured buildings, and listings.',
  },
};

const hubFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What are the best neighborhoods to buy in Manhattan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The best Manhattan neighborhoods depend on your lifestyle and budget. The Upper East Side and Upper West Side offer classic pre-war residences with park access. Tribeca and SoHo are known for luxury lofts. Chelsea and Greenwich Village combine culture with residential charm. Financial District offers modern high-rises with views.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the average price per square foot in Manhattan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Manhattan average price per square foot varies widely by neighborhood. Tribeca and SoHo command $2,000-$2,500/sq ft, while the Upper East Side averages around $1,400-$1,800/sq ft. Financial District and Midtown East range from $1,200-$1,600/sq ft. These figures fluctuate with market conditions.',
      },
    },
    {
      '@type': 'Question',
      name: 'Is it better to buy a condo or co-op in Manhattan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Condos offer more flexibility — no board approval, easier subletting, and simpler financing. Co-ops are typically 20-30% less expensive per square foot but require board approval, restrict subletting, and may limit financing. Your choice depends on budget, investment plans, and lifestyle preferences.',
      },
    },
    {
      '@type': 'Question',
      name: 'What are Manhattan rental prices like?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Manhattan median rent is approximately $4,000-$4,500 per month for a one-bedroom. Studio apartments average $2,800-$3,500, two-bedrooms $5,000-$7,000, and three-bedrooms $7,000-$12,000. Luxury rentals in neighborhoods like Tribeca and Hudson Yards can exceed $15,000 per month.',
      },
    },
  ],
};

const breadcrumbSchema = {
  '@context': 'https://schema.org',
  '@type': 'BreadcrumbList',
  itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
    { '@type': 'ListItem', position: 2, name: 'Manhattan', item: 'https://mallan.nyc/manhattan' },
  ],
};

export const revalidate = 3600;

export default function ManhattanHubPage() {
  return (
    <>
      <Header dark />

      {/* Hero */}
      <section className="relative h-[340px] sm:h-[400px] md:h-[440px] overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url(${config.heroImage})`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-black/10" />
        <div className="relative h-full flex flex-col justify-between max-w-7xl mx-auto px-4">
          {/* Breadcrumb at top */}
          <div className="pt-20 sm:pt-24">
            <NeighborhoodBreadcrumb isHub borough="Manhattan" boroughSlug="manhattan" />
          </div>

          {/* Title at bottom */}
          <div className="pb-8 sm:pb-12">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-sans font-semibold text-white tracking-tight">
              Manhattan Real Estate Guide
            </h1>
            <p className="mt-2 text-lg text-white/80 font-light max-w-2xl">
              Explore {neighborhoods.length} neighborhoods with market data, featured buildings, and
              broker insights to find your ideal Manhattan address.
            </p>
          </div>
        </div>
      </section>

      <main>
        {/* Intro */}
        <section className="py-10 sm:py-14">
          <div className="max-w-3xl mx-auto px-4">
            <p className="text-gray-600 text-base sm:text-lg leading-relaxed">
              {config.intro}
            </p>
          </div>
        </section>

        {/* Neighborhood Grid */}
        <NeighborhoodHubGrid neighborhoods={neighborhoods} boroughSlug="manhattan" />

        {/* Hub FAQ */}
        <section className="py-10 sm:py-14 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-6">
              Manhattan Real Estate FAQ
            </h2>
            <div className="space-y-2">
              {hubFaqSchema.mainEntity.map((faq, i) => (
                <details
                  key={i}
                  className="group bg-white rounded-lg border border-gray-200"
                >
                  <summary className="flex items-center justify-between gap-4 cursor-pointer px-5 py-4 text-sm sm:text-base font-medium text-gray-900 select-none">
                    {faq.name}
                    <span
                      aria-hidden="true"
                      className="shrink-0 text-gray-400 group-open:rotate-45 transition-transform text-lg"
                    >
                      +
                    </span>
                  </summary>
                  <div className="px-5 pb-4 text-sm sm:text-base text-gray-600 leading-relaxed">
                    {faq.acceptedAnswer.text}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-10 sm:py-14">
          <div className="max-w-4xl mx-auto px-4 text-center">
            <h2 className="text-2xl sm:text-3xl font-sans font-semibold text-gray-900 mb-3">
              Find Your Manhattan Home
            </h2>
            <p className="text-gray-500 mb-8 max-w-xl mx-auto">
              Search all active Manhattan listings or speak with our team for
              personalized guidance.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/buy?borough=Manhattan"
                className="inline-block px-8 py-3 bg-gray-900 text-white font-medium rounded-lg hover:bg-gray-800 transition-colors text-sm sm:text-base"
              >
                Search Manhattan Listings
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

      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(hubFaqSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
    </>
  );
}
