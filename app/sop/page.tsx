import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import ServerLegalPage from '@/app/components/ServerLegalPage';
import sopData from '@/data/pages/sop.json';

export const metadata: Metadata = {
  title: 'Standardized Operating Procedures | Mallan Real Estate',
  description: 'New York State required standardized operating procedures for real estate transactions, agency disclosure, and compensation.',
  alternates: { canonical: 'https://mallan.nyc/sop' },
  openGraph: {
    title: 'Standardized Operating Procedures | Mallan Real Estate',
    description: 'New York State required standardized operating procedures for real estate transactions, agency disclosure, and compensation.',
    url: 'https://mallan.nyc/sop',
  },
};

export default function SOPPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        <ServerLegalPage
          title={sopData.title}
          lastUpdated={sopData.lastUpdated}
          content={sopData.content}
        />
      </main>
      <Footer />
    </div>
  );
}
