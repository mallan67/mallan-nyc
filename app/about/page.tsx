import { Metadata } from 'next';
import SocialShareBar from '@/app/components/SocialShareBar';
import AboutContent from '@/app/components/AboutContent';

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
      <main className="pt-20">
        <AboutContent />
      </main>
      <SocialShareBar title="About Mallan Real Estate" />
    </div>
  );
}
