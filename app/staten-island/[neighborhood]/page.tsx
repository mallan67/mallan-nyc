import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadNeighborhoods, findNeighborhood } from '@/lib/neighborhoods/boroughs';
import BoroughDetailPage from '@/app/components/neighborhoods/BoroughDetailPage';

const allNeighborhoods = loadNeighborhoods('staten-island');

export function generateStaticParams() {
  return allNeighborhoods.map((n) => ({ neighborhood: n.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}): Promise<Metadata> {
  const { neighborhood: slug } = await params;
  const n = findNeighborhood('staten-island', slug);
  if (!n) return {};

  const title = `${n.name} Real Estate | Staten Island Homes & Rentals | Mallan Real Estate`;
  const description = `${n.summary} Search ${n.name} listings, market data, and featured homes on Staten Island.`;

  return {
    title,
    description,
    alternates: { canonical: `https://mallan.nyc/staten-island/${n.slug}` },
    openGraph: {
      title,
      description,
      url: `https://mallan.nyc/staten-island/${n.slug}`,
      images: [{ url: n.ogImage, width: 1200, height: 630, alt: n.name }],
    },
    twitter: { card: 'summary_large_image', title, description, images: [n.ogImage] },
  };
}

export const revalidate = 3600;

export default async function StatenIslandNeighborhoodPage({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}) {
  const { neighborhood: slug } = await params;
  const n = findNeighborhood('staten-island', slug);
  if (!n) notFound();

  return (
    <BoroughDetailPage
      neighborhood={n}
      allNeighborhoods={allNeighborhoods}
      borough="Staten Island"
      boroughSlug="staten-island"
    />
  );
}
