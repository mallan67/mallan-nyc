import { Metadata } from 'next';
import Header from '@/app/components/Header';
import Footer from '@/app/components/Footer';
import ResourceContent from '@/app/components/ResourceContent';

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const titles: Record<string, string> = {
    'buyers-guide': "Buyer's Guide",
    'sellers-guide': "Seller's Guide",
    'investors-guide': "Investor's Guide",
  };

  return {
    title: `${titles[slug] || 'Resource'} | Mallan Real Estate`,
    description: `Comprehensive ${titles[slug] || 'guide'} for NYC real estate from Mallan Real Estate.`,
  };
}

export default async function ResourcePage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="min-h-screen bg-white font-sans">
      <Header dark />
      <main className="pt-20">
        <ResourceContent slug={slug} />
      </main>
      <Footer />
    </div>
  );
}
