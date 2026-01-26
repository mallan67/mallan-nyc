import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import LegalPageContent from '@/app/components/LegalPageContent';

export const metadata: Metadata = {
  title: 'Privacy Policy | Mallan Real Estate',
  description: 'How we collect, use, and protect your personal information.',
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main>
        <LegalPageContent slug="privacy" />
      </main>
      <Footer />
    </div>
  );
}
