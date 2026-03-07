import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Rent in NYC | Mallan Real Estate',
  description: 'Search apartments and homes for rent in New York City. Find your perfect rental in Manhattan, Brooklyn, and beyond.',
  alternates: { canonical: 'https://mallan.nyc/rent' },
  openGraph: {
    title: 'Rent in NYC | Mallan Real Estate',
    description: 'Find apartments, lofts, and homes for rent across Manhattan, Brooklyn, and all NYC neighborhoods.',
    url: 'https://mallan.nyc/rent',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Rent in NYC | Mallan Real Estate',
    description: 'Find apartments, lofts, and homes for rent across Manhattan, Brooklyn, and all NYC neighborhoods.',
  },
};

export default async function RentPage(props: { searchParams: Promise<Record<string, string>> }) {
  const searchParams = await props.searchParams;
  const params = new URLSearchParams();
  const isCommercial = searchParams.type === 'commercial';
  params.set('tab', isCommercial ? 'rent-commercial' : 'rent-residential');

  for (const key of ['neighborhood', 'zip', 'q', 'minPrice', 'maxPrice', 'beds', 'baths']) {
    if (searchParams[key]) params.set(key, searchParams[key]);
  }

  redirect(`/search?${params.toString()}`);
}
