export default function AgentsLoading() {
  return (
    <div className="min-h-screen pt-20 px-4">
      <div className="max-w-7xl mx-auto animate-pulse">
        <div className="h-8 bg-gray-100 rounded-lg w-40 mb-4" />
        <div className="h-4 bg-gray-100 rounded w-64 mb-8" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-2xl overflow-hidden border border-black/5">
              <div className="aspect-square bg-gray-100" />
              <div className="p-5 space-y-3">
                <div className="h-6 bg-gray-100 rounded w-2/3" />
                <div className="h-4 bg-gray-50 rounded w-1/2" />
                <div className="h-3 bg-gray-50 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
