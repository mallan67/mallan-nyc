export default function FavoritesLoading() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-5xl mx-auto animate-pulse">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="h-7 w-44 bg-gray-200/80 rounded-lg mb-2" />
              <div className="h-3.5 w-32 bg-gray-100 rounded" />
            </div>
          </div>

          {/* Property cards grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="rounded-2xl ring-1 ring-black/[0.03] overflow-hidden"
              >
                <div className="aspect-[4/3] bg-gray-100" />
                <div className="p-4 space-y-2.5">
                  <div className="h-5 w-28 bg-gray-200/70 rounded" />
                  <div className="h-3.5 w-full bg-gray-100 rounded" />
                  <div className="h-3 w-24 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
