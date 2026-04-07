'use client';

export default function BuildingError({ reset }: { reset: () => void }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">
        Unable to load building data
      </h2>
      <p className="text-gray-600 mb-6">
        Something went wrong while loading this building profile. Please try again.
      </p>
      <button
        onClick={reset}
        className="px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm font-medium"
      >
        Try Again
      </button>
    </div>
  );
}
