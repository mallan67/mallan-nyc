import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Saved Searches',
  description: 'Manage your saved property searches and alerts.',
  robots: { index: false, follow: false },
};

export default function SavedSearchesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
