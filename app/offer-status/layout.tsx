import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offer Status',
  description: 'Track the status of your property inquiries and offers.',
  robots: { index: false, follow: false },
};

export default function OfferStatusLayout({ children }: { children: React.ReactNode }) {
  return children;
}
