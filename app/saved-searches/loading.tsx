export default function SavedSearchesLoading() {
  return (
    <div className="min-h-screen bg-[#FEFEFE] font-sans">
      <main className="pt-24 pb-20 px-4">
        <div className="max-w-3xl mx-auto animate-pulse">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="h-7 w-40 bg-gray-200/80 rounded-lg mb-2" />
              <div className="h-3.5 w-32 bg-gray-100 rounded" />
            </div>
          </div>

          {/* Search rows */}
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-2xl ring-1 ring-black/[0.03] p-4 flex items-center gap-4"
              >
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="h-4 w-40 bg-gray-200/70 rounded" />
                  <div className="h-3 w-64 bg-gray-100 rounded" />
                  <div className="h-2.5 w-24 bg-gray-100/80 rounded" />
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <div className="h-8 w-24 bg-gray-200/50 rounded-xl" />
                  <div className="h-8 w-8 bg-gray-100 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
