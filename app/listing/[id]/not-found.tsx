import Link from 'next/link';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';

export default function ListingNotFound() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <Header dark />
      <main className="pt-32 pb-20 px-4">
        <div className="max-w-xl mx-auto text-center">
          <h1 className="text-3xl font-display font-semibold mb-4">
            Listing Not Available
          </h1>
          <p className="text-brand-dark/60 mb-2">
            This listing may have been removed, sold, or is no longer on the market.
          </p>
          <p className="text-brand-dark/40 text-sm mb-8">
            Listings are updated frequently from the REBNY Residential Listing Service.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/buy"
              className="px-8 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors"
            >
              Browse Sales
            </Link>
            <Link
              href="/rent"
              className="px-8 py-3 bg-white text-brand-dark font-medium rounded-2xl ring-1 ring-black/10 hover:bg-gray-50 transition-colors"
            >
              Browse Rentals
            </Link>
            <Link
              href="/search"
              className="px-8 py-3 bg-white text-brand-dark font-medium rounded-2xl ring-1 ring-black/10 hover:bg-gray-50 transition-colors"
            >
              Search All
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
