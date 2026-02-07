import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import ServerLegalPage from '@/app/components/ServerLegalPage';
import termsData from '@/data/pages/terms.json';

export const metadata: Metadata = {
  title: 'Terms of Service | Mallan Real Estate',
  description: 'Terms and conditions for using the Mallan Real Estate Inc. website and real estate services.',
  alternates: { canonical: 'https://mallan.nyc/terms' },
  openGraph: {
    title: 'Terms of Service | Mallan Real Estate',
    description: 'Terms and conditions for using the Mallan Real Estate Inc. website and real estate services.',
    url: 'https://mallan.nyc/terms',
  },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        <ServerLegalPage
          title={termsData.title}
          lastUpdated={termsData.lastUpdated}
          content={termsData.content}
        />
      </main>
      <Footer />
    </div>
  );
}
