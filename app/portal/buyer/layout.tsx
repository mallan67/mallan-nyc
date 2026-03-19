import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Buyer Portal — Mallan Real Estate',
  description: 'Browse listings, schedule showings, track your home search.',
  robots: { index: false, follow: false },
};

export default function BuyerPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
