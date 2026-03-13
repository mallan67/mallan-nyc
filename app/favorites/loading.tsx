export default function FavoritesLoading() {
  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-100 rounded-lg w-48 mb-6" />
        <div className="h-4 bg-gray-100 rounded w-64 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-black/5">
              <div className="aspect-[4/3] bg-gray-100" />
              <div className="p-4 space-y-2">
                <div className="h-5 bg-gray-100 rounded w-1/2" />
                <div className="h-4 bg-gray-100 rounded w-3/4" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
