import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Landlord Portal — Mallan Real Estate',
  description: 'Manage rental listings, view applications, track tenants.',
  robots: { index: false, follow: false },
};

export default function LandlordPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
