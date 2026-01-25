import { Suspense } from 'react';
import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import PropertySearch from '@/app/components/PropertySearch';

export const metadata: Metadata = {
  title: 'Rent in NYC | Mallan Real Estate',
  description: 'Search apartments and homes for rent in New York City. Find your perfect rental in Manhattan, Brooklyn, and beyond.',
};

function SearchLoading() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading properties...</p>
      </div>
    </div>
  );
}

export default function RentPage() {
  return (
    <div className="min-h-screen bg-white font-serif">
      <Header />
      <main>
        <Suspense fallback={<SearchLoading />}>
          <PropertySearch type="rent" />
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}
