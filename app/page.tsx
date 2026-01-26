import Header from './components/Header';
import HeroSearch from './components/HeroSearch';
import FeaturedListings from './components/FeaturedListings';
import ExploreNeighborhoods from './components/ExploreNeighborhoods';
import ValueProposition from './components/ValueProposition';
import TrustMarkers from './components/TrustMarkers';
import Footer from './components/Footer';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main id="main-content" role="main" tabIndex={-1}>
        <HeroSearch />
        <FeaturedListings />
        <ValueProposition />
        <ExploreNeighborhoods />
        <TrustMarkers />
      </main>
      <Footer />
    </div>
  );
}
