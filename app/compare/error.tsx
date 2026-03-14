'use client';

import * as Sentry from "@sentry/nextjs";
import { useEffect } from 'react';
import Link from 'next/link';

export default function CompareError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-display font-bold text-brand-dark mb-3">
          Comparison unavailable
        </h1>
        <p className="text-brand-dark/70 mb-6">
          We couldn&apos;t load the property comparison. Please try again.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-6 py-2.5 bg-brand-gold text-white font-semibold rounded-lg hover:bg-brand-gold/90 transition-colors"
          >
            Try Again
          </button>
          <Link
            href="/search"
            className="px-6 py-2.5 border border-brand-dark/20 text-brand-dark font-semibold rounded-lg hover:bg-gray-50 transition-colors"
          >
            Search Properties
          </Link>
        </div>
      </div>
    </div>
  );
}
