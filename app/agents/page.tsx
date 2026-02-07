import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import AgentsGrid from '@/app/components/AgentsGrid';

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
    title: 'Our Agents | Mallan Real Estate',
    description: 'Meet our team of licensed, experienced real estate professionals serving buyers, sellers, and renters across NYC.',
  },
};

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        <AgentsGrid />
      </main>
      <Footer />
    </div>
  );
}
