import Header from './components/Header';
import HeroSearch from './components/HeroSearch';
import FeaturedListings from './components/FeaturedListings';
import ExploreNeighborhoods from './components/ExploreNeighborhoods';
import Footer from './components/Footer';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white font-serif">
      <Header />
      <main>
        <HeroSearch />
        <FeaturedListings />
        <ExploreNeighborhoods />
      </main>
      <Footer />
    </div>
  );
}
