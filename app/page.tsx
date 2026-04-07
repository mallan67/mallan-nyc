import HeroSearch from './components/HeroSearch';
import FeaturedListings from './components/FeaturedListings';
import ExploreNeighborhoods from './components/ExploreNeighborhoods';
import ExclusivesVault from './components/ExclusivesVault';
import ZillowTestimonials from './components/ZillowTestimonials';
import AboutSection from './components/AboutSection';
import ValueProposition from './components/ValueProposition';
import SellerCTA from './components/SellerCTA';
import NewsletterSignup from './components/NewsletterSignup';
import CTASection from './components/CTASection';
import TrustMarkers from './components/TrustMarkers';
import SocialShareBar from './components/SocialShareBar';
import ListingSidePanel from './components/ListingSidePanel';
import { SidePanelProvider } from '@/lib/contexts/ListingSidePanelContext';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mallan Real Estate Inc. | NYC Luxury Apartments, Condos & Rentals',
  description:
    'Search NYC apartments for sale and rent. Luxury condos, co-ops, and rentals across Manhattan, Brooklyn, and all five boroughs. Licensed Real Estate Broker #10991205323.',
  openGraph: {
    title: 'Mallan Real Estate Inc. | NYC Luxury Apartments, Condos & Rentals',
    description:
      'Search NYC apartments for sale and rent. Luxury condos, co-ops, and rentals across Manhattan, Brooklyn, and all five boroughs.',
    url: 'https://mallan.nyc',
  },
  alternates: {
    canonical: 'https://mallan.nyc',
  },
};

export const revalidate = 3600;

export default function HomePage() {
  return (
    <SidePanelProvider>
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <main role="main" tabIndex={-1}>
          <HeroSearch />
          <FeaturedListings />
          <ExploreNeighborhoods />
          <ExclusivesVault />
          <ZillowTestimonials />
          <AboutSection />
          <ValueProposition />
          <SellerCTA />
          <NewsletterSignup />
          <CTASection />
          <TrustMarkers />
        </main>
        <ListingSidePanel />
        <SocialShareBar title="Mallan Real Estate Inc. | Licensed NYC Real Estate Broker" />
      </div>
    </SidePanelProvider>
  );
}
