import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import SocialShareBar from '@/app/components/SocialShareBar';
import AgentsGrid from '@/app/components/AgentsGrid';
import PhotoPageHero from '@/app/components/PhotoPageHero';

export const revalidate = 3600;

export const metadata: Metadata = {
  title: 'Our Agents | Mallan Real Estate',
  description: 'Meet our team of experienced real estate professionals serving New York City.',
  alternates: { canonical: 'https://mallan.nyc/agents' },
  openGraph: {
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.',
    url: 'https://mallan.nyc/agents',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.',
  },
};

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main>
        <PhotoPageHero
          eyebrow="The Team"
          title="Licensed NYC Brokers."
          subtitle="Specialists in residential and commercial real estate across all five boroughs."
          focus="center 45%"
        />
        <AgentsGrid />
      </main>
      <SocialShareBar title="Our Agents | Mallan Real Estate" />
      <Footer />
    </div>
  );
}
