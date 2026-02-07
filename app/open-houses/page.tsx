import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import OpenHousesList from '@/app/components/OpenHousesList';

export const metadata: Metadata = {
  title: 'Open Houses | Mallan Real Estate',
  description: 'Browse upcoming open houses in New York City. Find your next home with Mallan Real Estate.',
  alternates: { canonical: 'https://mallan.nyc/open-houses' },
  openGraph: {
    title: 'Open Houses | Mallan Real Estate',
    description: 'Browse upcoming open houses across Manhattan, Brooklyn, and NYC. Schedule a visit with Mallan Real Estate.',
    url: 'https://mallan.nyc/open-houses',
  },
  twitter: {
    title: 'Open Houses | Mallan Real Estate',
    description: 'Browse upcoming open houses across Manhattan, Brooklyn, and NYC. Schedule a visit with Mallan Real Estate.',
  },
};

export default function OpenHousesPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        <OpenHousesList />
      </main>
      <Footer />
    </div>
  );
}
