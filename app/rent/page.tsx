import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import PropertySearch from '@/app/components/PropertySearch';

export const metadata: Metadata = {
  title: 'Rent in NYC | Mallan Real Estate',
  description: 'Search apartments and homes for rent in New York City. Find your perfect rental in Manhattan, Brooklyn, and beyond.',
};

export default function RentPage() {
  return (
    <div className="min-h-screen bg-white font-serif">
      <Header />
      <main>
        <PropertySearch type="rent" />
      </main>
      <Footer />
    </div>
  );
}
