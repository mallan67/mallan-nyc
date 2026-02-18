import Header from './components/Header';
import HeroSearch from './components/HeroSearch';
import StatsStrip from './components/StatsStrip';
import FeaturedListings from './components/FeaturedListings';
import TestimonialStrip from './components/TestimonialStrip';
import ExploreNeighborhoods from './components/ExploreNeighborhoods';
import ValueProposition from './components/ValueProposition';
import TrustMarkers from './components/TrustMarkers';
import RecentTransactions from './components/RecentTransactions';
import Footer from './components/Footer';
import SocialShareBar from './components/SocialShareBar';
import ScrollReveal from './components/ScrollReveal';

export const revalidate = 3600;

function SectionDivider() {
  return (
    <div className="section-divider py-2">
      <span className="section-divider-dot" />
    </div>
  );
}

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main id="main-content" role="main" tabIndex={-1}>
        <HeroSearch />
        <ScrollReveal>
          <StatsStrip />
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <FeaturedListings />
        </ScrollReveal>
        <ScrollReveal delay={50}>
          <TestimonialStrip />
        </ScrollReveal>
        <SectionDivider />
        <ScrollReveal delay={100}>
          <RecentTransactions />
        </ScrollReveal>
        <ScrollReveal delay={100}>
          <ExploreNeighborhoods />
        </ScrollReveal>
        <SectionDivider />
        <ScrollReveal delay={100}>
          <ValueProposition />
        </ScrollReveal>
        <ScrollReveal delay={50}>
          <TrustMarkers />
        </ScrollReveal>
      </main>
      <SocialShareBar title="Mallan Real Estate Inc. | Licensed NYC Real Estate Broker" />
      <Footer />
    </div>
  );
}
