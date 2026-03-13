import { Metadata } from 'next';
import SocialShareBar from '@/app/components/SocialShareBar';
import ResourceContent from '@/app/components/ResourceContent';

export const revalidate = 604800;

export function generateStaticParams() {
  return [
    { slug: 'buyers-guide' },
    { slug: 'sellers-guide' },
    { slug: 'investors-guide' },
  ];
}

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

  const title = `${titles[slug] || 'Resource'} | Mallan Real Estate`;
  const description = `Comprehensive ${titles[slug] || 'guide'} for NYC real estate from Mallan Real Estate.`;

  return {
    title,
    description,
    alternates: { canonical: `https://mallan.nyc/resources/${slug}` },
    openGraph: {
      title,
      description,
      url: `https://mallan.nyc/resources/${slug}`,
      images: [{ url: 'https://mallan.nyc/images/og-default.png', width: 1200, height: 630, alt: titles[slug] || 'Resource' }],
    },
    twitter: { card: 'summary_large_image', title, description, images: ['https://mallan.nyc/images/og-default.png'] },
  };
}

export default async function ResourcePage({ params }: Props) {
  const { slug } = await params;

  return (
    <div className="min-h-screen bg-white font-sans">
      <main className="pt-20">
        <ResourceContent slug={slug} />
      </main>
      <SocialShareBar title={`${slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} | Mallan Real Estate`} />
    </div>
  );
}
