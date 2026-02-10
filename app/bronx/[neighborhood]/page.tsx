import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { loadNeighborhoods, findNeighborhood } from '@/lib/neighborhoods/boroughs';
import BoroughDetailPage from '@/app/components/neighborhoods/BoroughDetailPage';

const allNeighborhoods = loadNeighborhoods('bronx');

export function generateStaticParams() {
  return allNeighborhoods.map((n) => ({ neighborhood: n.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}): Promise<Metadata> {
  const { neighborhood: slug } = await params;
  const n = findNeighborhood('bronx', slug);
  if (!n) return {};

  const title = `${n.name} Real Estate | Bronx Homes & Rentals | Mallan Real Estate`;
  const description = `${n.summary} Search ${n.name} listings, market data, and featured buildings in the Bronx.`;

  return {
    title,
    description,
    alternates: { canonical: `https://mallan.nyc/bronx/${n.slug}` },
    openGraph: {
      title,
      description,
      url: `https://mallan.nyc/bronx/${n.slug}`,
      images: [{ url: n.ogImage, width: 1200, height: 630, alt: n.name }],
    },
    twitter: { title, description },
  };
}

export const revalidate = 3600;

export default async function BronxNeighborhoodPage({
  params,
}: {
  params: Promise<{ neighborhood: string }>;
}) {
  const { neighborhood: slug } = await params;
  const n = findNeighborhood('bronx', slug);
  if (!n) notFound();

  return (
    <BoroughDetailPage
      neighborhood={n}
      allNeighborhoods={allNeighborhoods}
      borough="Bronx"
      boroughSlug="bronx"
    />
  );
}
