import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import SocialShareBar from '@/app/components/SocialShareBar';
import ResourceContent, { type ResourceData } from '@/app/components/ResourceContent';
import buyersGuide from '@/data/resources/buyers-guide.json';
import sellersGuide from '@/data/resources/sellers-guide.json';
import investorsGuide from '@/data/resources/investors-guide.json';

export const revalidate = 604800;
// Only the three guides exist. Any other slug is a 404 from the router, not a 200 "not found" page.
export const dynamicParams = false;

// The guide text is read here, on the server, so it is in the HTML. (It used to be fetched in the browser
// from /api/resources/<slug>, a route deleted on 2026-03-15; see tests/runtime/resource-guides-render.test.ts.)
const GUIDES: Record<string, ResourceData> = {
  'buyers-guide': buyersGuide,
  'sellers-guide': sellersGuide,
  'investors-guide': investorsGuide,
};

const TITLES: Record<string, string> = {
  'buyers-guide': "Buyer's Guide",
  'sellers-guide': "Seller's Guide",
  'investors-guide': "Investor's Guide",
};

export function generateStaticParams() {
  return Object.keys(GUIDES).map((slug) => ({ slug }));
}

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  // The layout's title template adds the brand to <title>; the share titles below have no template.
  const title = TITLES[slug] || 'Resource';
  const shareTitle = `${title} | Mallan Real Estate Inc.`;
  const description = `Comprehensive ${TITLES[slug] || 'guide'} for NYC real estate from Mallan Real Estate.`;

  return {
    title,
    description,
    alternates: { canonical: `https://mallan.nyc/resources/${slug}` },
    openGraph: {
      title: shareTitle,
      description,
      url: `https://mallan.nyc/resources/${slug}`,
      images: [{ url: 'https://mallan.nyc/images/og-default.png', width: 1200, height: 630, alt: TITLES[slug] || 'Resource' }],
    },
    twitter: { card: 'summary_large_image', title: shareTitle, description, images: ['https://mallan.nyc/images/og-default.png'] },
  };
}

export default async function ResourcePage({ params }: Props) {
  const { slug } = await params;
  // hasOwn: a slug such as "constructor" must not find an inherited property.
  const data = Object.hasOwn(GUIDES, slug) ? GUIDES[slug] : undefined;
  if (!data) notFound();

  return (
    <div className="min-h-screen bg-white font-sans">
      <main className="pt-20">
        <ResourceContent slug={slug} data={data} />
      </main>
      <SocialShareBar title={`${slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} | Mallan Real Estate`} />
    </div>
  );
}
