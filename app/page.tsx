import HeroSearch from './components/HeroSearch';
import SmartSearch from './components/SmartSearch';
import FeaturedListings from './components/FeaturedListings';
import ExploreNeighborhoods from './components/ExploreNeighborhoods';
import ExclusivesVault from './components/ExclusivesVault';
import ZillowTestimonials from './components/ZillowTestimonials';
import AboutSection from './components/AboutSection';
import ValueProposition from './components/ValueProposition';
import NewsletterSignup from './components/NewsletterSignup';
import CTASection from './components/CTASection';
import TrustMarkers from './components/TrustMarkers';
import SocialShareBar from './components/SocialShareBar';
import ListingSidePanel from './components/ListingSidePanel';
import { SidePanelProvider } from '@/lib/contexts/ListingSidePanelContext';

export const revalidate = 3600;

export default function HomePage() {
  return (
    <SidePanelProvider>
      <div className="min-h-screen bg-[#FEFEFE] font-sans">
        <main role="main" tabIndex={-1}>
          <HeroSearch />
          {/* AI-powered natural language property search */}
          <section className="bg-gradient-to-b from-[#F8F7F4] to-[#FEFEFE] py-8 md:py-12">
            <div className="max-w-2xl mx-auto px-4">
              <h2 className="text-center font-display text-lg md:text-xl font-bold text-brand-dark mb-4">
                Find Your Perfect Home
              </h2>
              <SmartSearch />
            </div>
          </section>
          <FeaturedListings />
          <ExploreNeighborhoods />
          <ExclusivesVault />
          <ZillowTestimonials />
          <AboutSection />
          <ValueProposition />
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
