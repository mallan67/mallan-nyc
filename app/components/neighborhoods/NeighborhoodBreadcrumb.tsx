import Link from 'next/link';
import type { Borough, BoroughSlug } from '@/lib/types/neighborhood';

interface NeighborhoodBreadcrumbProps {
  neighborhoodName?: string;
  isHub?: boolean;
  borough?: Borough;
  boroughSlug?: BoroughSlug;
}

export default function NeighborhoodBreadcrumb({
  neighborhoodName,
  isHub = false,
  borough = 'Manhattan',
  boroughSlug = 'manhattan',
}: NeighborhoodBreadcrumbProps) {
  return (
    <nav aria-label="Breadcrumb" className="max-w-7xl mx-auto px-4 pt-24 pb-2">
      <ol className="flex items-center gap-1.5 text-sm text-gray-500">
        <li>
          <Link href="/" className="hover:text-brand-gold transition-colors">
            Home
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        {isHub ? (
          <li aria-current="page" className="text-gray-900 font-medium">
            {borough}
          </li>
        ) : (
          <>
            <li>
              <Link
                href={`/${boroughSlug}`}
                className="hover:text-brand-gold transition-colors"
              >
                {borough}
              </Link>
            </li>
            <li aria-hidden="true">/</li>
            <li aria-current="page" className="text-gray-900 font-medium">
              {neighborhoodName}
            </li>
          </>
        )}
      </ol>
    </nav>
  );
}
