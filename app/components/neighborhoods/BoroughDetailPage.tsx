import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import IDXDisclaimer from '@/app/components/IDXDisclaimer';
import NeighborhoodBreadcrumb from './NeighborhoodBreadcrumb';
import NeighborhoodHero from './NeighborhoodHero';
import AnswerBox from './AnswerBox';
import MicroFAQ from './MicroFAQ';
import LiveListingsWidget from './LiveListingsWidget';
import MarketStatsModule from './MarketStatsModule';
import FeaturedBuildingsModule from './FeaturedBuildingsModule';
import StreetGuidanceSection from './StreetGuidanceSection';
import BuyerPersonas from './BuyerPersonas';
import NeighborhoodCTASection from './NeighborhoodCTASection';
import AdjacentNeighborhoods from './AdjacentNeighborhoods';
import type { Neighborhood, Borough, BoroughSlug } from '@/lib/types/neighborhood';

interface BoroughDetailPageProps {
  neighborhood: Neighborhood;
  allNeighborhoods: Neighborhood[];
  borough: Borough;
  boroughSlug: BoroughSlug;
}

export default function BoroughDetailPage({
  neighborhood: n,
  allNeighborhoods,
  borough,
  boroughSlug,
}: BoroughDetailPageProps) {
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://mallan.nyc' },
      { '@type': 'ListItem', position: 2, name: borough, item: `https://mallan.nyc/${boroughSlug}` },
      { '@type': 'ListItem', position: 3, name: n.name, item: `https://mallan.nyc/${boroughSlug}/${n.slug}` },
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
      <Header dark />
      <NeighborhoodHero
        name={n.name}
        tagline={n.tagline}
        heroImage={n.heroImage}
        transit={n.transit}
      >
        <NeighborhoodBreadcrumb neighborhoodName={n.name} borough={borough} boroughSlug={boroughSlug} />
      </NeighborhoodHero>

      <main>
        <AnswerBox neighborhood={n} />
        <MicroFAQ name={n.name} faqs={n.faqs} />
        <LiveListingsWidget neighborhoodSlug={n.slug} name={n.name} />
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
          boroughSlug={boroughSlug}
        />
      </main>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <IDXDisclaimer variant="compact" />
      </div>

      <Footer />

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
