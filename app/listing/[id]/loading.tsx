export default function ListingLoading() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      {/* Breadcrumb skeleton */}
      <div className="bg-white/80 border-b border-black/5 pt-[68px]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5">
          <div className="flex items-center gap-2">
            <div className="h-4 w-12 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-16 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-4 bg-gray-100 rounded animate-pulse" />
            <div className="h-4 w-24 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        {/* Photo gallery skeleton */}
        <div className="mt-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-2xl overflow-hidden">
            <div className="md:col-span-2 md:row-span-2 aspect-[4/3] bg-gray-100 animate-pulse" />
            <div className="hidden md:block aspect-[4/3] bg-gray-100 animate-pulse" />
            <div className="hidden md:block aspect-[4/3] bg-gray-100 animate-pulse" />
            <div className="hidden md:block aspect-[4/3] bg-gray-100 animate-pulse" />
            <div className="hidden md:block aspect-[4/3] bg-gray-100 animate-pulse" />
          </div>
        </div>

        {/* Content grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 pb-12">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Address + price */}
            <div>
              <div className="h-8 w-80 bg-gray-100 rounded-lg animate-pulse mb-2" />
              <div className="h-5 w-48 bg-gray-50 rounded animate-pulse mb-4" />
              <div className="h-10 w-40 bg-gray-100 rounded-lg animate-pulse" />
            </div>

            {/* Key facts row */}
            <div className="flex gap-6 py-4 border-y border-black/5">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="text-center">
                  <div className="h-6 w-10 bg-gray-100 rounded animate-pulse mx-auto mb-1" />
                  <div className="h-3 w-14 bg-gray-50 rounded animate-pulse mx-auto" />
                </div>
              ))}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <div className="h-5 w-24 bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-50 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-50 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-50 rounded animate-pulse" />
              <div className="h-4 w-5/6 bg-gray-50 rounded animate-pulse" />
            </div>

            {/* Details grid */}
            <div className="grid grid-cols-2 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-1">
                  <div className="h-3 w-20 bg-gray-100 rounded animate-pulse" />
                  <div className="h-4 w-28 bg-gray-50 rounded animate-pulse" />
                </div>
              ))}
            </div>

            {/* Amenities */}
            <div className="space-y-3">
              <div className="h-5 w-36 bg-gray-100 rounded animate-pulse" />
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} className="h-8 w-24 bg-gray-50 rounded-full animate-pulse" />
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Contact card */}
            <div className="rounded-2xl border border-black/5 p-5 space-y-4">
              <div className="h-5 w-32 bg-gray-100 rounded animate-pulse" />
              <div className="h-10 w-full bg-gray-100 rounded-lg animate-pulse" />
              <div className="h-10 w-full bg-gray-50 rounded-lg animate-pulse" />
              <div className="h-10 w-full bg-gray-50 rounded-lg animate-pulse" />
              <div className="h-11 w-full bg-brand-gold/20 rounded-lg animate-pulse" />
            </div>

            {/* Calculator card */}
            <div className="rounded-2xl border border-black/5 p-5 space-y-3">
              <div className="h-5 w-36 bg-gray-100 rounded animate-pulse" />
              <div className="h-8 w-28 bg-gray-50 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-50 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-50 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
