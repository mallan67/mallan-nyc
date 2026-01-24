import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import OpenHousesList from '@/app/components/OpenHousesList';

export const metadata: Metadata = {
  title: 'Open Houses | Mallan Real Estate',
  description: 'Browse upcoming open houses in New York City. Find your next home with Mallan Real Estate.',
};

export default function OpenHousesPage() {
  return (
    <div className="min-h-screen bg-white font-serif">
      <Header />
      <main>
        <OpenHousesList />
      </main>
      <Footer />
    </div>
  );
}
