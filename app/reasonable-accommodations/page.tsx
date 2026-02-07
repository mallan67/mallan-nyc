import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import ServerLegalPage from '@/app/components/ServerLegalPage';
import accommodationsData from '@/data/pages/reasonable-accommodations.json';

export const metadata: Metadata = {
  title: 'Reasonable Accommodations | Mallan Real Estate',
  description: 'Mallan Real Estate policy on reasonable accommodations and modifications for individuals with disabilities under the Fair Housing Act and ADA.',
  alternates: { canonical: 'https://mallan.nyc/reasonable-accommodations' },
  openGraph: {
    title: 'Reasonable Accommodations | Mallan Real Estate',
    description: 'Mallan Real Estate policy on reasonable accommodations and modifications for individuals with disabilities under the Fair Housing Act and ADA.',
    url: 'https://mallan.nyc/reasonable-accommodations',
  },
};

export default function ReasonableAccommodationsPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        <ServerLegalPage
          title={accommodationsData.title}
          lastUpdated={accommodationsData.lastUpdated}
          content={accommodationsData.content}
        />
      </main>
      <Footer />
    </div>
  );
}
