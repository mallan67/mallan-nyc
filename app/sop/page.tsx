import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import LegalPageContent from '@/app/components/LegalPageContent';

export const metadata: Metadata = {
  title: 'Standardized Operating Procedures | Mallan Real Estate',
  description: 'New York State required standardized operating procedures for real estate transactions.',
};

export default function SOPPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main>
        <LegalPageContent slug="sop" />
      </main>
      <Footer />
    </div>
  );
}
