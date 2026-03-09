export default function ListingLoading() {
  return (
    <div className="min-h-screen">
      {/* Gallery skeleton */}
      <div className="bg-stone-100">
        <div className="max-w-[1600px] mx-auto">
          <div className="aspect-[4/3] md:aspect-[3/2] bg-gray-200 animate-pulse" />
          <div className="hidden md:flex gap-1.5 px-4 py-3 bg-white/80">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="w-[88px] h-[60px] rounded-lg bg-gray-200 animate-pulse flex-shrink-0" />
            ))}
          </div>
        </div>
      </div>
      {/* Content skeleton */}
      <div className="py-8 md:py-10 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-3 gap-8 lg:gap-10">
            <div className="lg:col-span-2 space-y-6 animate-pulse">
              <div className="h-10 bg-gray-100 rounded-lg w-1/3" />
              <div className="h-6 bg-gray-100 rounded w-2/3" />
              <div className="h-5 bg-gray-100 rounded w-1/2" />
              <div className="flex gap-4 py-4 px-1 rounded-2xl bg-[#F8F7F4]">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="px-4 py-2">
                    <div className="h-6 w-12 bg-gray-200 rounded" />
                  </div>
                ))}
              </div>
              <div className="space-y-3 pt-6">
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-full" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
              </div>
            </div>
            <div className="animate-pulse">
              <div className="rounded-3xl bg-gray-100 p-6 space-y-4">
                <div className="h-5 bg-gray-200 rounded w-2/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
                <div className="h-12 bg-gray-200 rounded-2xl" />
                <div className="h-12 bg-gray-200 rounded-2xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
