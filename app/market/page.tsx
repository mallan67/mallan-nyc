import { Metadata } from 'next';
import MarketReportContent from './MarketReportContent';

export const revalidate = 300; // 5 min ISR

export const metadata: Metadata = {
  title: 'NYC Market Report | Mallan Real Estate',
  description: 'New York City real estate market data and trends. Median prices, days on market, inventory, and neighborhood breakdowns for sales and rentals.',
  alternates: { canonical: 'https://mallan.nyc/market' },
  openGraph: {
    title: 'NYC Market Report | Mallan Real Estate',
    description: 'New York City real estate market data and trends. Median prices, days on market, inventory, and neighborhood breakdowns.',
    url: 'https://mallan.nyc/market',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'NYC Market Report | Mallan Real Estate',
    description: 'New York City real estate market data and trends.',
  },
};

export default function MarketPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <main className="pt-20">
        <MarketReportContent />
      </main>
    </div>
  );
}
