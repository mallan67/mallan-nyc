import { Metadata } from 'next';
import { notFound } from 'next/navigation';

/**
 * Neighborhoods Layout - Phase 3 (Parallel-Safe)
 *
 * This layout applies noindex/nofollow to the entire /neighborhoods/* segment
 * AND gates access behind feature flag. Both protections are required.
 *
 * DO NOT REMOVE these protections until Phase 4 compliance approval.
 */

// Force noindex on all neighborhood pages
export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};

export default function NeighborhoodsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Feature flag gate - return 404 unless explicitly enabled
  const isEnabled = process.env.NEXT_PUBLIC_FEATURE_NEIGHBORHOODS === 'true';

  if (!isEnabled) {
    notFound();
  }

  return <>{children}</>;
}
