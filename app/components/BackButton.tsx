'use client';

import { useRouter } from 'next/navigation';

export default function BackButton({ fallbackHref }: { fallbackHref: string }) {
  const router = useRouter();

  return (
    <button
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
        } else {
          router.push(fallbackHref);
        }
      }}
      className="inline-flex items-center gap-1.5 text-sm text-brand-dark/90 hover:text-brand-dark transition-colors mr-3"
      aria-label="Go back"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
      </svg>
      <span className="md:hidden">Back</span>
    </button>
  );
}
