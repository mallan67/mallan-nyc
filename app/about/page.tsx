import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import SocialShareBar from '@/app/components/SocialShareBar';
import AboutContent from '@/app/components/AboutContent';
import PhotoPageHero from '@/app/components/PhotoPageHero';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'About Us | Mallan Real Estate',
  description: 'Learn about Mallan Real Estate - our story, mission, and commitment to exceptional service in NYC real estate.',
  alternates: { canonical: 'https://mallan.nyc/about' },
  openGraph: {
    title: 'About Us | Mallan Real Estate',
    description: 'Learn about Mallan Real Estate Inc. — a full-service NYC brokerage committed to exceptional service in residential sales and rentals.',
    url: 'https://mallan.nyc/about',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Us | Mallan Real Estate',
    description: 'Learn about Mallan Real Estate Inc. — a full-service NYC brokerage committed to exceptional service in residential sales and rentals.',
  },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main>
        <PhotoPageHero
          eyebrow="Our Story"
          title="About Mallan Real Estate."
          subtitle="A boutique NYC brokerage built on local knowledge, direct access, and honest guidance."
          focus="center 30%"
        />
        <AboutContent />
      </main>
      <SocialShareBar title="About Mallan Real Estate" />
      <Footer />
    </div>
  );
}
