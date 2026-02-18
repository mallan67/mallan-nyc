import Header from './components/Header';
import HeroSearch from './components/HeroSearch';
import StatsStrip from './components/StatsStrip';
import FeaturedListings from './components/FeaturedListings';
import TestimonialStrip from './components/TestimonialStrip';
import ExploreNeighborhoods from './components/ExploreNeighborhoods';
import ValueProposition from './components/ValueProposition';
import TrustMarkers from './components/TrustMarkers';
import Footer from './components/Footer';
import SocialShareBar from './components/SocialShareBar';

export const revalidate = 3600;

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main id="main-content" role="main" tabIndex={-1}>
        <HeroSearch />
        <StatsStrip />
        <FeaturedListings />
        <TestimonialStrip />
        <ExploreNeighborhoods />
        <ValueProposition />
        <TrustMarkers />
      </main>
      <SocialShareBar title="Mallan Real Estate Inc. | Licensed NYC Real Estate Broker" />
      <Footer />
    </div>
  );
}
