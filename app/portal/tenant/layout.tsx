import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Tenant Portal — Mallan Real Estate',
  description: 'View available rentals, manage your lease, explore options.',
  robots: { index: false, follow: false },
};

export default function TenantPortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
