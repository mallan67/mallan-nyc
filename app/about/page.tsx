import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import AboutContent from '@/app/components/AboutContent';

export const metadata: Metadata = {
  title: 'About Us | Mallan Real Estate',
  description: 'Learn about Mallan Real Estate - our story, mission, and commitment to exceptional service in NYC real estate.',
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main>
        <AboutContent />
      </main>
      <Footer />
    </div>
  );
}
