import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import type { Neighborhood } from '@/lib/types/neighborhood';
import { loadNeighborhoods, findNeighborhood } from '@/lib/neighborhoods/boroughs';
import SocialShareBar from '@/app/components/SocialShareBar';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import NeighborhoodBreadcrumb from '@/app/components/neighborhoods/NeighborhoodBreadcrumb';
import NeighborhoodHero from '@/app/components/neighborhoods/NeighborhoodHero';
import AnswerBox from '@/app/components/neighborhoods/AnswerBox';
import MicroFAQ from '@/app/components/neighborhoods/MicroFAQ';
import LiveListingsWidget from '@/app/components/neighborhoods/LiveListingsWidget';
import MarketStatsModule from '@/app/components/neighborhoods/MarketStatsModule';
import FeaturedBuildingsModule from '@/app/components/neighborhoods/FeaturedBuildingsModule';
import StreetGuidanceSection from '@/app/components/neighborhoods/StreetGuidanceSection';
import BuyerPersonas from '@/app/components/neighborhoods/BuyerPersonas';
import NeighborhoodCTASection from '@/app/components/neighborhoods/NeighborhoodCTASection';
import AdjacentNeighborhoods from '@/app/components/neighborhoods/AdjacentNeighborhoods';

const allNeighborhoods = loadNeighborhoods('manhattan');

export function generateStaticParams() {
  return allNeighborhoods.map((n) => ({ neighborhood: n.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}): Promise<Metadata> {
  const { neighborhood: slug } = await params;
  const n = findNeighborhood('manhattan', slug);
  if (!n) return {};

  const title = `${n.name} Real Estate | Condos, Co-ops & Rentals | Mallan Real Estate`;
  const description = `${n.summary} Search ${n.name} listings, market data, and featured buildings in Manhattan.`;

  return {
    title,
    description,
    alternates: { canonical: `https://mallan.nyc/manhattan/${n.slug}` },
    openGraph: {
      title,
      description,
      url: `https://mallan.nyc/manhattan/${n.slug}`,
      images: [{ url: n.ogImage, width: 1200, height: 630, alt: n.name }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [n.ogImage] },
  };
}

export const revalidate = 3600;

export default async function NeighborhoodPage({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}) {
  const { neighborhood: slug } = await params;
  const n = findNeighborhood('manhattan', slug) as Neighborhood | undefined;
  if (!n) notFound();

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
      { '@type': 'ListItem', position: 2, name: 'Manhattan', item: 'https://mallan.nyc/manhattan' },
      { '@type': 'ListItem', position: 3, name: n.name, item: `https://mallan.nyc/manhattan/${n.slug}` },
    ],
  };

  const placeSchema = {
    '@context': 'https://schema.org',
    '@type': 'Place',
    name: n.fullName,
    description: n.summary,
    address: {
      '@type': 'PostalAddress',
      addressLocality: 'New York',
      addressRegion: 'NY',
      addressCountry: 'US',
    },
  };

  return (
    <>
      <NeighborhoodHero
        name={n.name}
        tagline={n.tagline}
        heroImage={n.heroImage}
        transit={n.transit}
      >
        <NeighborhoodBreadcrumb neighborhoodName={n.name} borough="Manhattan" boroughSlug="manhattan" />
      </NeighborhoodHero>

      <main>
        <AnswerBox neighborhood={n} />
        <MicroFAQ name={n.name} faqs={n.faqs} />
        <LiveListingsWidget neighborhoodSlug={n.slug} name={n.name} zipCodes={n.zipCodes} bounds={n.bounds} />
        <MarketStatsModule name={n.name} stats={n.marketStats} />
        {n.featuredBuildings.length > 0 && (
          <FeaturedBuildingsModule name={n.name} buildings={n.featuredBuildings} />
        )}
        {n.streetGuidance.description && (
          <StreetGuidanceSection name={n.name} guidance={n.streetGuidance} />
        )}
        {n.buyerPersonas.length > 0 && (
          <BuyerPersonas name={n.name} personas={n.buyerPersonas} />
        )}
        <NeighborhoodCTASection name={n.name} ctas={n.ctas} />
        <AdjacentNeighborhoods
          currentSlug={n.slug}
          adjacentSlugs={n.adjacentNeighborhoods}
          allNeighborhoods={allNeighborhoods}
          boroughSlug="manhattan"
        />
      </main>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <IDXDisclaimer variant="compact" />
      </div>

      <SocialShareBar title={`${n.name} Real Estate | Mallan Real Estate`} />

      {/* JSON-LD structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(placeSchema) }}
      />
    </>
  );
}
