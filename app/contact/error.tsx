'use client';

import * as Sentry from "@sentry/nextjs";
import { useEffect } from 'react';

export default function ContactError({
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
          Page temporarily unavailable
        </h1>
        <p className="text-brand-dark/70 mb-6">
          We couldn&apos;t load this page. Please try again or call us at 646-258-4460.
        </p>
        <button
          onClick={reset}
          className="px-6 py-2.5 bg-brand-gold text-white font-semibold rounded-lg hover:bg-brand-gold/90 transition-colors"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
