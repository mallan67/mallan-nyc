import { Suspense } from 'react';
import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import PropertySearch from '@/app/components/PropertySearch';

export const metadata: Metadata = {
  title: 'Buy Property in NYC | Mallan Real Estate',
  description: 'Search properties for sale in New York City. Condos, co-ops, and townhouses across Manhattan, Brooklyn, and beyond.',
  alternates: { canonical: 'https://mallan.nyc/buy' },
  openGraph: {
    title: 'Buy Property in NYC | Mallan Real Estate',
    description: 'Search condos, co-ops, townhouses, and commercial properties for sale across Manhattan, Brooklyn, and NYC.',
    url: 'https://mallan.nyc/buy',
  },
  twitter: {
    title: 'Buy Property in NYC | Mallan Real Estate',
    description: 'Search condos, co-ops, townhouses, and commercial properties for sale across Manhattan, Brooklyn, and NYC.',
  },
};

const buyFaqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'What types of properties can I buy in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'In New York City you can purchase condos, co-ops (cooperative apartments), condops, townhouses, multi-family homes, and commercial properties. Each ownership type has different rules — for example, co-op purchases require board approval while condos do not.',
      },
    },
    {
      '@type': 'Question',
      name: 'How much does it cost to buy an apartment in Manhattan?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Manhattan apartment prices vary widely by neighborhood and property type. Studios can start around $400,000, one-bedrooms from $600,000, and two-bedrooms from $1,000,000. Luxury and premium properties range from $2 million to $20 million and above. Additional costs include closing costs (typically 2-5% for condos, 1-2% for co-ops), attorney fees, and monthly maintenance or common charges.',
      },
    },
    {
      '@type': 'Question',
      name: 'Do I need a buyer\'s agent in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'While not legally required, having a licensed buyer\'s agent in NYC is highly recommended. A buyer\'s agent represents your interests exclusively, helps negotiate price and terms, guides you through board applications (for co-ops), coordinates with attorneys, and provides access to listings including off-market and exclusive properties.',
      },
    },
    {
      '@type': 'Question',
      name: 'What is the difference between a condo and a co-op in NYC?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'With a condo, you own the physical unit as real property and pay common charges and real estate taxes separately. With a co-op, you own shares in a corporation that owns the building, and your monthly maintenance includes property taxes. Co-ops typically require board approval, have stricter financial requirements, and may limit subletting. Condos generally offer more flexibility but may have higher purchase prices.',
      },
    },
  ],
};

function SearchLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading properties...</p>
      </div>
    </div>
  );
}

export default function BuyPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buyFaqSchema) }}
      />
      <Header dark />
      <main>
        <Suspense fallback={<SearchLoading />}>
          <PropertySearch type="buy" />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
