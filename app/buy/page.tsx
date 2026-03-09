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

/**
 * /buy is served via next.config.js rewrite → /search?tab=buy-residential.
 * This page only fires as a fallback (e.g., ?type=commercial query param).
 */
export default async function BuyPage(props: { searchParams: Promise<Record<string, string>> }) {
  const searchParams = await props.searchParams;
  const params = new URLSearchParams();
  const isCommercial = searchParams.type === 'commercial';
  params.set('tab', isCommercial ? 'buy-commercial' : 'buy-residential');

  for (const key of ['neighborhood', 'zip', 'q', 'minPrice', 'maxPrice', 'beds', 'baths']) {
    if (searchParams[key]) params.set(key, searchParams[key]);
  }

  redirect(`/search?${params.toString()}`);
}
