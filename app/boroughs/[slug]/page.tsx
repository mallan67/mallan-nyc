import { notFound } from 'next/navigation';

/**
 * Individual Borough Page - Phase 3 Placeholder
 *
 * This page is not publicly accessible until NEXT_PUBLIC_FEATURE_BOROUGHS=true
 * The parent layout.tsx handles the feature flag gating and noindex metadata.
 *
 * DO NOT link to this page from public navigation.
 */

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function BoroughPage({ params }: Props) {
  const { slug } = await params;

  // Placeholder - no borough data implemented yet
  // Return notFound for any slug until Phase 4
  notFound();

  return null;
}
