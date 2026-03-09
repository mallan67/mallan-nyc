export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-white pt-20">
      {/* Filter bar skeleton */}
      <div className="border-b border-black/5 px-4 py-3">
        <div className="max-w-[1440px] mx-auto flex gap-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-24 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>

      {/* Results skeleton */}
      <div className="max-w-[1440px] mx-auto px-4 py-6">
        <div className="h-5 w-48 bg-gray-100 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="rounded-xl overflow-hidden border border-black/5">
              <div className="aspect-[4/3] bg-gray-100 animate-pulse" />
              <div className="p-4 space-y-2">
                <div className="h-5 w-28 bg-gray-100 rounded animate-pulse" />
                <div className="h-4 w-40 bg-gray-50 rounded animate-pulse" />
                <div className="h-4 w-32 bg-gray-50 rounded animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
