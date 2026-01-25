'use client';

/**
 * Skip to main content link for keyboard users (WCAG 2.1 AA requirement)
 * Visible only on focus for screen reader and keyboard navigation users
 */
export default function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-white focus:text-gray-900 focus:font-medium focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      Skip to main content
    </a>
  );
}
