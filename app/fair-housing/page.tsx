import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import LegalPageContent from '@/app/components/LegalPageContent';

export const metadata: Metadata = {
  title: 'Fair Housing Statement | Mallan Real Estate',
  description: 'Our commitment to fair housing and equal opportunity for all.',
};

export default function FairHousingPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main>
        <LegalPageContent slug="fair-housing" />
      </main>
      <Footer />
    </div>
  );
}
