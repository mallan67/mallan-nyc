import Header from './components/Header';
import HeroSearch from './components/HeroSearch';
import FeaturedListings from './components/FeaturedListings';
import ExploreNeighborhoods from './components/ExploreNeighborhoods';
import ExclusivesVault from './components/ExclusivesVault';
import ZillowTestimonials from './components/ZillowTestimonials';
import AboutSection from './components/AboutSection';
import ValueProposition from './components/ValueProposition';
import CTASection from './components/CTASection';
import TrustMarkers from './components/TrustMarkers';
import Footer from './components/Footer';
import SocialShareBar from './components/SocialShareBar';
import ListingSidePanel from './components/ListingSidePanel';
import { SidePanelProvider } from '@/lib/contexts/ListingSidePanelContext';

export const revalidate = 3600;

export default function HomePage() {
  return (
    <SidePanelProvider>
      <div className="min-h-screen bg-[#FAFAFA] font-sans">
        <Header />
        <main id="main-content" role="main" tabIndex={-1}>
          <HeroSearch />
          <FeaturedListings />
          <ExploreNeighborhoods />
          <ExclusivesVault />
          <ZillowTestimonials />
          <AboutSection />
          <ValueProposition />
          <CTASection />
          <TrustMarkers />
        </main>
        <ListingSidePanel />
        <SocialShareBar title="Mallan Real Estate Inc. | Licensed NYC Real Estate Broker" />
        <Footer />
      </div>
    </SidePanelProvider>
  );
}
