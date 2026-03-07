import { Suspense } from 'react';
import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import SocialShareBar from '@/app/components/SocialShareBar';
import PropertySearch from '@/app/components/PropertySearch';
import MovingCostEstimator from '@/app/components/MovingCostEstimator';
import RentVsBuyStandalone from '@/app/components/RentVsBuyStandalone';
import { getListingsServer } from '@/lib/idx/get-listings-server';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Rent in NYC | Mallan Real Estate',
  description: 'Search apartments and homes for rent in New York City. Find your perfect rental in Manhattan, Brooklyn, and beyond.',
  alternates: { canonical: 'https://mallan.nyc/rent' },
  openGraph: {
    title: 'Rent in NYC | Mallan Real Estate',
    description: 'Find apartments, lofts, and homes for rent across Manhattan, Brooklyn, and all NYC neighborhoods.',
    url: 'https://mallan.nyc/rent',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rent in NYC | Mallan Real Estate',
    description: 'Find apartments, lofts, and homes for rent across Manhattan, Brooklyn, and all NYC neighborhoods.',
  },
};

const rentFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How much does it cost to rent an apartment in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'NYC rental prices vary significantly by neighborhood. Studios in Manhattan typically range from $2,500 to $4,500/month, one-bedrooms from $3,000 to $6,000/month, and two-bedrooms from $4,000 to $10,000/month. Brooklyn and other boroughs may offer lower prices. Most landlords require annual income of 40x the monthly rent.',
      },
    },
    {
      '@type': 'Question',
      name: 'What do I need to rent an apartment in New York City?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'To rent in NYC you typically need: government-issued photo ID, proof of income (pay stubs, tax returns, or employment letter), bank statements, references from prior landlords, a credit report, and a completed rental application. Most landlords require annual income of at least 40 times the monthly rent, or a guarantor who earns 80 times the rent.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need a broker to rent in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'A broker is not required but can be very helpful in NYC\'s competitive rental market. Brokers have access to listings before they hit public platforms, can schedule multiple viewings efficiently, assist with applications, and negotiate lease terms on your behalf.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the difference between net effective rent and gross rent?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Gross rent is the actual monthly amount you pay. Net effective rent factors in concessions like free months — for example, 1 month free on a 12-month lease at $3,600/month equals a net effective rent of $3,300/month ($3,600 x 11 / 12). Always confirm which figure is being quoted when viewing listings.',
      },
    },
  ],
};

function SearchLoading() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-brand-dark/85">Loading properties...</p>
      </div>
    </div>
  );
}

export default async function RentPage() {
  // Fetch listings server-side — ISR caches this for 1 hour at the edge.
  const data = await getListingsServer('rent', 50);

  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(rentFaqSchema) }}
      />
      <Header dark />
      <main>
        <Suspense fallback={<SearchLoading />}>
          <PropertySearch
            type="rent"
            initialListings={data.listings}
            initialTotal={data.total}
            initialHasMore={data.hasMore}
          />
        </Suspense>
      </main>
      <section className="py-8 px-4 bg-gray-50/50 border-t border-black/5">
        <div className="max-w-xl mx-auto space-y-6">
          <RentVsBuyStandalone />
          <MovingCostEstimator />
        </div>
      </section>
      <SocialShareBar title="Rent in NYC | Mallan Real Estate" />
      <Footer />
    </div>
  );
}
