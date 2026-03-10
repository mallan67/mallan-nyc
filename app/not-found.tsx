import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="min-h-screen bg-[#FEFEFE] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <h1 className="font-display text-6xl font-bold text-brand-dark mb-4">404</h1>
        <h2 className="font-display text-xl font-semibold text-brand-dark/90 mb-3">
          Page Not Found
        </h2>
        <p className="text-brand-dark/70 mb-8 leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            href="/"
            className="px-6 py-3 bg-brand-dark text-white font-medium rounded-2xl hover:bg-brand-dark/90 transition-colors"
          >
            Back to Home
          </Link>
          <Link
            href="/search?type=sale"
            className="px-6 py-3 ring-1 ring-black/10 text-brand-dark font-medium rounded-2xl hover:bg-gray-50 transition-colors"
          >
            Search Properties
          </Link>
        </div>
        <p className="mt-12 text-xs text-brand-dark/50">
          Mallan Real Estate Inc. | Licensed Real Estate Broker | NY DOS #10991205323
        </p>
      </div>
    </main>
  );
}
