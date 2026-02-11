import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import ServerLegalPage from '@/app/components/ServerLegalPage';
import fairHousingData from '@/data/pages/fair-housing.json';

export const revalidate = 604800;

export const metadata: Metadata = {
  title: 'Fair Housing Statement | Mallan Real Estate',
  description: 'Mallan Real Estate commitment to fair housing, equal opportunity, and compliance with federal, New York State, and NYC human rights laws.',
  alternates: { canonical: 'https://mallan.nyc/fair-housing' },
  openGraph: {
    title: 'Fair Housing Statement | Mallan Real Estate',
    description: 'Mallan Real Estate commitment to fair housing, equal opportunity, and compliance with federal, New York State, and NYC human rights laws.',
    url: 'https://mallan.nyc/fair-housing',
  },
};

export default function FairHousingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        <ServerLegalPage
          title={fairHousingData.title}
          lastUpdated={fairHousingData.lastUpdated}
          content={fairHousingData.content}
        />
      </main>
      <Footer />
    </div>
  );
}
