'use client';

import * as Sentry from "@sentry/nextjs";
import { useEffect } from 'react';

export default function GlobalError({
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
    <html>
      <body>
        <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', fontFamily: 'system-ui, sans-serif' }}>
          <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.75rem' }}>
              Something went wrong
            </h1>
            <p style={{ color: '#666', marginBottom: '1.5rem' }}>
              We encountered an unexpected error. Please try again or contact us at 646-258-4460.
            </p>
            <button
              onClick={reset}
              style={{ padding: '0.625rem 1.5rem', background: '#B8860B', color: '#fff', fontWeight: 600, borderRadius: '0.5rem', border: 'none', cursor: 'pointer' }}
            >
              Try Again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
