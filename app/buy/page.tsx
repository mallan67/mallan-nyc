import { Metadata } from 'next';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Buy Property in NYC | Mallan Real Estate',
  description: 'Search properties for sale in New York City. Condos, co-ops, and townhouses across Manhattan, Brooklyn, and beyond.',
  alternates: { canonical: 'https://mallan.nyc/buy' },
  openGraph: {
    title: 'Buy Property in NYC | Mallan Real Estate',
    description: 'Search condos, co-ops, townhouses, and commercial properties for sale across Manhattan, Brooklyn, and NYC.',
    url: 'https://mallan.nyc/buy',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Buy Property in NYC | Mallan Real Estate',
    description: 'Search condos, co-ops, townhouses, and commercial properties for sale across Manhattan, Brooklyn, and NYC.',
  },
};

export default async function BuyPage(props: { searchParams: Promise<Record<string, string>> }) {
  const searchParams = await props.searchParams;
  // Preserve any query params (e.g. ?type=commercial, ?neighborhood=...)
  const params = new URLSearchParams();
  const isCommercial = searchParams.type === 'commercial';
  params.set('tab', isCommercial ? 'buy-commercial' : 'buy-residential');

  // Forward known filter params
  for (const key of ['neighborhood', 'zip', 'q', 'minPrice', 'maxPrice', 'beds', 'baths', 'exclusive']) {
    if (searchParams[key]) params.set(key, searchParams[key]);
  }

  redirect(`/search?${params.toString()}`);
}
