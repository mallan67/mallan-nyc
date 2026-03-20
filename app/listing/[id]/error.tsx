'use client';

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from 'react';
import Link from 'next/link';

export default function ListingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  // Auto-retry once after a short delay (handles transient hydration errors)
  useEffect(() => {
    const timer = setTimeout(() => {
      setRetrying(true);
      reset();
    }, 1500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-display font-bold text-brand-dark mb-3">
          {retrying ? 'Retrying...' : 'Listing temporarily unavailable'}
        </h1>
        <p className="text-brand-dark/70 mb-6">
          We couldn&apos;t load this listing right now. This is usually a brief
          data-source delay. Please try again.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-brand-gold text-white font-semibold rounded-lg hover:bg-brand-gold/90 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/buy"
            className="px-6 py-2.5 bg-white text-brand-dark font-semibold rounded-lg ring-1 ring-black/10 hover:bg-gray-50 transition-colors"
          >
            Browse Listings
          </Link>
        </div>
      </div>
    </div>
  );
}
