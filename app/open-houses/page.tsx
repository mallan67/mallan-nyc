import { Metadata } from 'next';
import SocialShareBar from '@/app/components/SocialShareBar';
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
    card: 'summary_large_image',
    title: 'Open Houses | Mallan Real Estate',
    description: 'Browse upcoming open houses across Manhattan, Brooklyn, and NYC. Schedule a visit with Mallan Real Estate.',
  },
};

export default function OpenHousesPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <main className="pt-20">
        <OpenHousesList />
      </main>
      <SocialShareBar title="Open Houses | Mallan Real Estate" />
    </div>
  );
}
