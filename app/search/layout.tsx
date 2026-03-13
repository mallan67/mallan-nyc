import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Search Properties',
  description:
    'Search apartments, condos, co-ops, townhouses, and rentals across Manhattan, Brooklyn, Queens, the Bronx, and Staten Island. Updated daily from the REBNY RLS.',
  openGraph: {
    title: 'Search NYC Properties | Mallan Real Estate Inc.',
    description:
      'Browse thousands of apartments, condos, and townhouses for sale and rent across all five NYC boroughs.',
    images: [{ url: 'https://mallan.nyc/images/og-default.png', width: 1200, height: 630, alt: 'Search NYC Properties' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Search NYC Properties | Mallan Real Estate Inc.',
    images: ['https://mallan.nyc/images/og-default.png'],
  },
};

export default function SearchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
