import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Seller Portal — Mallan Real Estate',
  description: 'Manage your listing, view showings, track offers.',
  robots: { index: false, follow: false },
};

export default function SellerPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
