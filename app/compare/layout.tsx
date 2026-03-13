import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Compare Properties',
  description: 'Compare properties side by side on Mallan Real Estate.',
  robots: { index: false, follow: false },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
