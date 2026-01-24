import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import LegalPageContent from '@/app/components/LegalPageContent';

export const metadata: Metadata = {
  title: 'Terms of Service | Mallan Real Estate',
  description: 'Terms and conditions for using Mallan Real Estate services.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white font-serif">
      <Header />
      <main>
        <LegalPageContent slug="terms" />
      </main>
      <Footer />
    </div>
  );
}
