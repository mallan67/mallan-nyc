import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import AgentsGrid from '@/app/components/AgentsGrid';

export const metadata: Metadata = {
  title: 'Our Agents | Mallan Real Estate',
  description: 'Meet our team of experienced real estate professionals serving New York City.',
};

export default function AgentsPage() {
  return (
    <div className="min-h-screen bg-white font-sans">
      <Header />
      <main>
        <AgentsGrid />
      </main>
      <Footer />
    </div>
  );
}
