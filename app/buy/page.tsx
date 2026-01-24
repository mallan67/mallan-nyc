import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import PropertySearch from '@/app/components/PropertySearch';

export const metadata: Metadata = {
  title: 'Buy Property in NYC | Mallan Real Estate',
  description: 'Search properties for sale in New York City. Condos, co-ops, and townhouses across Manhattan, Brooklyn, and beyond.',
};

export default function BuyPage() {
  return (
    <div className="min-h-screen bg-white font-serif">
      <Header />
      <main>
        <PropertySearch type="buy" />
      </main>
      <Footer />
    </div>
  );
}
