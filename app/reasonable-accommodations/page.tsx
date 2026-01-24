import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import LegalPageContent from '@/app/components/LegalPageContent';

export const metadata: Metadata = {
  title: 'Reasonable Accommodations | Mallan Real Estate',
  description: 'Our policy on reasonable accommodations for individuals with disabilities.',
};

export default function ReasonableAccommodationsPage() {
  return (
    <div className="min-h-screen bg-white font-serif">
      <Header />
      <main>
        <LegalPageContent slug="reasonable-accommodations" />
      </main>
      <Footer />
    </div>
  );
}
