import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saved Favorites',
  description: 'Your saved favorite properties on Mallan Real Estate.',
  robots: { index: false, follow: false },
};

export default function FavoritesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
